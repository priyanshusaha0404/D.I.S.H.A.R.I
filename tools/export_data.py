#!/usr/bin/env python3
"""Exports the D.I.S.H.A.R.I data set to the static files the website reads (public/data).

The website never runs this script: its output is committed to the repository so the site works as a static,
offline-capable app. Run it only to refresh the data after a new pipeline release has been loaded into PostGIS:

    python tools/export_data.py --db postgresql://dishari:dishari_dev@localhost:5432/dishari --cog ../DISHARI_Platform/data/cog

Only real inputs and models validated on real occurrence records are exported.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import re
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import psycopg
import rasterio
from PIL import Image
from psycopg.rows import dict_row
from pyproj import Transformer
from rasterio import features
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform_bounds
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree
from shapely import wkb
from shapely.geometry import mapping

sys.path.insert(0, str(Path(__file__).resolve().parent))
from variables import CATEGORIES, DRIVER_LABELS, SERIES, SOURCES, SPECIES_FIX, THEME_LABELS, VARIABLES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data"
TO_WGS = Transformer.from_crs(32645, 4326, always_xy=True)
TO_UTM = Transformer.from_crs(4326, 32645, always_xy=True)
SIMPLIFY_M = 8.0          # vector simplification tolerance (metres, applied in UTM)
SNAP_WATER_M = 600
SNAP_WALK_M = 400
MIN_WATER_COMPONENT = 300
MIN_WALK_COMPONENT = 40


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def jdump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def gzwrite(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(data)


def r6(x):
    return None if x is None else round(float(x), 6)


def fnum(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else None
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def geom_to_wgs(g, simplify=SIMPLIFY_M, digits=5):
    """UTM shapely geometry -> GeoJSON dict in EPSG:4326 (simplified, rounded)."""
    import shapely
    if simplify:
        g = g.simplify(simplify, preserve_topology=True)
    g = shapely.transform(g, lambda c: np.c_[TO_WGS.transform(c[:, 0], c[:, 1])])
    gj = mapping(g)

    def rnd(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], digits), round(c[1], digits)]
        return [rnd(x) for x in c]
    return {"type": gj["type"], "coordinates": rnd(gj["coordinates"])}


def fc(features_):
    return {"type": "FeatureCollection", "features": features_}


def bbox_wgs(g):
    x0, y0, x1, y1 = g.bounds
    a = TO_WGS.transform(x0, y0)
    b = TO_WGS.transform(x1, y1)
    return [round(a[0], 5), round(a[1], 5), round(b[0], 5), round(b[1], 5)]


# ======================================================================================== main
class Exporter:
    def __init__(self, db: str, cog: Path):
        self.conn = psycopg.connect(db, row_factory=dict_row)
        from psycopg.types.numeric import FloatLoader
        self.conn.adapters.register_loader("numeric", FloatLoader)    # numeric -> float (not Decimal)
        self.cog = cog
        self.files: dict[str, dict] = {}

    def q(self, sql, params=None):
        return self.conn.execute(sql, params or ()).fetchall()

    # ------------------------------------------------------------------ hexagons
    def load_hex(self):
        rows = self.q("""SELECT grid_id, area_km2, land_frac, np_share, pa_share, block_name, district_name,
                                ST_X(centroid_wgs) lon, ST_Y(centroid_wgs) lat, ST_AsBinary(geom) g, attributes
                         FROM geo.grid_cells ORDER BY grid_id""")
        self.hex = rows
        self.n = len(rows)
        self.hex_index = {r["grid_id"]: i for i, r in enumerate(rows)}
        self.hex_geom = [wkb.loads(bytes(r["g"])) for r in rows]
        cx = np.array([g.centroid.x for g in self.hex_geom])
        cy = np.array([g.centroid.y for g in self.hex_geom])
        self.hex_xy = np.c_[cx, cy]
        self.hex_tree = cKDTree(self.hex_xy)
        log(f"hexagons: {self.n}")

    def overlaps(self, sql_entities: str, key="id"):
        """{entity_id: [[hex_index, overlap_km2], ...]} for polygon entities (geom in EPSG:32645)."""
        rows = self.q(f"""WITH e AS ({sql_entities})
                          SELECT e.{key} AS eid, g.grid_id, ST_Area(ST_Intersection(e.geom, g.geom)) / 1e6 AS km2
                          FROM e JOIN geo.grid_cells g ON ST_Intersects(e.geom, g.geom)""")
        out: dict = defaultdict(list)
        for r in rows:
            if r["km2"] and r["km2"] >= 0.0005:
                out[r["eid"]].append([self.hex_index[r["grid_id"]], round(r["km2"], 4)])
        return out

    # ------------------------------------------------------------------ admin, islands, protected areas
    def admin(self):
        units = self.q("""SELECT id, level, name, code, parent_id, population, households, village_count, area_km2,
                                 ST_AsBinary(geom) g FROM geo.administrative_units WHERE level IN ('district','block') ORDER BY level, name""")
        ov = self.overlaps("SELECT id, geom FROM geo.administrative_units WHERE level IN ('district','block')")
        self.districts, self.blocks = [], []
        dist_by_id = {}
        feats = {"district": [], "block": []}
        for u in units:
            g = wkb.loads(bytes(u["g"]))
            c = g.representative_point()
            lon, lat = TO_WGS.transform(c.x, c.y)
            rec = {"id": u["id"], "name": u["name"], "code": u["code"], "parent": u["parent_id"],
                   "population": u["population"], "households": u["households"], "villages": u["village_count"],
                   "area_km2": round(u["area_km2"], 2) if u["area_km2"] else round(g.area / 1e6, 2),
                   "lon": round(lon, 5), "lat": round(lat, 5), "bbox": bbox_wgs(g), "cells": ov.get(u["id"], [])}
            (self.districts if u["level"] == "district" else self.blocks).append(rec)
            if u["level"] == "district":
                dist_by_id[u["id"]] = u["name"]
            feats[u["level"]].append({"type": "Feature", "id": u["id"], "properties": {"id": u["id"], "name": u["name"]},
                                      "geometry": geom_to_wgs(g, 15)})
        for b in self.blocks:
            b["district"] = dist_by_id.get(b["parent"])
        self.block_names = [b["name"] for b in self.blocks]
        self.district_names = [d["name"] for d in self.districts]
        self.write_json("vector/districts.geojson", fc(feats["district"]))
        self.write_json("vector/blocks.geojson", fc(feats["block"]))
        log(f"admin: {len(self.districts)} districts, {len(self.blocks)} blocks")

    def islands(self):
        rows = self.q("""SELECT id, uid, name, category, land_area_km2, admin_unit, inhabited, hazards, about, nearest_port,
                                dist_to_port_km, ST_AsBinary(geom) g FROM geo.islands ORDER BY id""")
        ov = self.overlaps("SELECT id, geom FROM geo.islands")
        self.island_recs, feats = [], []
        for r in rows:
            g = wkb.loads(bytes(r["g"]))
            c = g.representative_point()
            lon, lat = TO_WGS.transform(c.x, c.y)
            self.island_recs.append({
                "id": r["id"], "name": r["name"], "category": r["category"], "land_area_km2": fnum(r["land_area_km2"]),
                "inhabited": r["inhabited"], "hazards": r["hazards"], "about": r["about"], "nearest_port": r["nearest_port"],
                "dist_to_port_km": fnum(r["dist_to_port_km"]), "area_km2": round(g.area / 1e6, 2),
                "lon": round(lon, 5), "lat": round(lat, 5), "bbox": bbox_wgs(g), "cells": ov.get(r["id"], [])})
            feats.append({"type": "Feature", "id": r["id"], "properties": {"id": r["id"], "name": r["name"] or ""},
                          "geometry": geom_to_wgs(g)})
        self.write_json("vector/islands.geojson", fc(feats))
        # hexagon -> island with the largest overlap
        self.hex_island = np.full(self.n, -1, dtype=int)
        best = np.zeros(self.n)
        for k, rec in enumerate(self.island_recs):
            for hi, km2 in rec["cells"]:
                if km2 > best[hi]:
                    best[hi], self.hex_island[hi] = km2, k
        log(f"islands: {len(self.island_recs)}")

    def protected(self):
        rows = self.q("""SELECT id, wdpa_id, name, original_name, designation, designation_type, iucn_category, status, status_year,
                                reported_area_km2, governance, management_authority, is_forest_unit, is_core, ST_AsBinary(geom) g
                         FROM geo.protected_areas ORDER BY id""")
        ov = self.overlaps("SELECT id, geom FROM geo.protected_areas")
        self.pa_recs, feats = [], []
        self.core_geoms, self.forest_geoms = [], []
        for r in rows:
            g = wkb.loads(bytes(r["g"]))
            c = g.representative_point()
            lon, lat = TO_WGS.transform(c.x, c.y)
            kind = "core" if r["is_core"] else ("forest" if r["is_forest_unit"] else "designation")
            if r["is_core"]:
                self.core_geoms.append(g)
            elif r["is_forest_unit"]:
                self.forest_geoms.append(g)
            self.pa_recs.append({
                "id": r["id"], "wdpa_id": r["wdpa_id"], "name": r["name"], "designation": r["designation"],
                "designation_type": r["designation_type"], "iucn": r["iucn_category"], "status": r["status"],
                "status_year": r["status_year"], "reported_km2": fnum(r["reported_area_km2"]), "governance": r["governance"],
                "authority": r["management_authority"], "kind": kind, "area_km2": round(g.area / 1e6, 2),
                "lon": round(lon, 5), "lat": round(lat, 5), "bbox": bbox_wgs(g), "cells": ov.get(r["id"], [])})
            feats.append({"type": "Feature", "id": r["id"],
                          "properties": {"id": r["id"], "name": r["name"], "designation": r["designation"], "kind": kind},
                          "geometry": geom_to_wgs(g, 12)})
        self.write_json("vector/protected_areas.geojson", fc([f for f in feats if f["properties"]["kind"] != "designation"]))
        self.write_json("vector/designations.geojson", fc([f for f in feats if f["properties"]["kind"] == "designation"]))
        # protection class per hexagon: 3 National Park core (majority), 2 forest compartment / sanctuary (majority), 1 open
        forest_share = np.zeros(self.n)
        for rec in self.pa_recs:
            if rec["kind"] == "forest":
                for hi, km2 in rec["cells"]:
                    forest_share[hi] += km2
        area = np.array([h["area_km2"] or 1.6 for h in self.hex])
        self.forest_share = np.clip(forest_share / np.maximum(area, 1e-6), 0, 1)
        np_share = np.array([fnum(h["np_share"]) or 0 for h in self.hex])
        self.protection = np.where(np_share >= 0.5, 3, np.where(self.forest_share + np_share >= 0.5, 2, 1))
        log(f"protected areas: {len(self.pa_recs)}; hexagons core={int((self.protection == 3).sum())} "
            f"permit={int((self.protection == 2).sum())} open={int((self.protection == 1).sum())}")

    # ------------------------------------------------------------------ villages and towns
    def villages(self):
        rows = self.q("""SELECT v.id, v.census_code, v.name, v.gram_panchayat, v.block_name, v.subdistrict_name, v.district_name,
                                v.settlement_type, v.population, v.households, v.avg_household_size, v.male_population, v.area_km2,
                                ST_AsBinary(v.geom) g FROM geo.villages v ORDER BY v.id""")
        ov = self.overlaps("SELECT id, geom FROM geo.villages")
        self.village_recs, feats = [], []
        for r in rows:
            g = wkb.loads(bytes(r["g"]))
            c = g.representative_point()
            lon, lat = TO_WGS.transform(c.x, c.y)
            pop, male = r["population"], r["male_population"]
            self.village_recs.append({
                "id": r["id"], "code": r["census_code"], "name": r["name"], "gp": r["gram_panchayat"], "block": r["block_name"],
                "subdistrict": r["subdistrict_name"], "district": r["district_name"], "type": r["settlement_type"],
                "population": pop, "households": r["households"], "hh_size": fnum(r["avg_household_size"]), "male": male,
                "female": (pop - male) if pop is not None and male is not None else None,
                "area_km2": fnum(r["area_km2"]) or round(g.area / 1e6, 3),
                "lon": round(lon, 5), "lat": round(lat, 5), "bbox": bbox_wgs(g), "cells": ov.get(r["id"], [])})
            feats.append({"type": "Feature", "id": r["id"],
                          "properties": {"id": r["id"], "name": r["name"], "t": "town" if r["settlement_type"] == "Urban" else "village",
                                         "pop": pop or 0}, "geometry": geom_to_wgs(g)})
        self.write_json("vector/villages.geojson", fc(feats))
        log(f"villages: {len(self.village_recs)}")

    # ------------------------------------------------------------------ waterways, points, other vectors
    def vectors(self):
        rows = self.q("SELECT id, osm_class, name, name_bn, length_km, ST_AsBinary(geom) g FROM geo.waterways ORDER BY id")
        feats = []
        by_name: dict = defaultdict(list)
        for r in rows:
            g = wkb.loads(bytes(r["g"]))
            feats.append({"type": "Feature", "id": r["id"], "properties": {"id": r["id"], "c": r["osm_class"], "name": r["name"] or ""},
                          "geometry": geom_to_wgs(g, 6)})
            if r["name"]:
                by_name[r["name"]].append((r, g))
        self.write_json("vector/waterways.geojson", fc(feats))
        # rivers (grouped by name, keyed like the gazetteer: 'ww:<min id>')
        self.river_recs = []
        for name, items in by_name.items():
            ids = [r["id"] for r, _ in items]
            from shapely.ops import unary_union
            u = unary_union([g for _, g in items])
            cells: dict = defaultdict(float)
            # hexagons crossed by the river, weighted by length inside
            cand = self.q("""SELECT g.grid_id, ST_Length(ST_Intersection(g.geom, w.geom)) AS m
                             FROM geo.grid_cells g JOIN geo.waterways w ON ST_Intersects(g.geom, w.geom) WHERE w.id = ANY(%s)""", (ids,))
            for c in cand:
                cells[self.hex_index[c["grid_id"]]] += c["m"] / 1000
            cls = sorted({r["osm_class"] for r, _ in items})
            c = u.interpolate(0.5, normalized=True)
            lon, lat = TO_WGS.transform(c.x, c.y)
            self.river_recs.append({"id": f"ww:{min(ids)}", "name": name, "name_bn": next((r["name_bn"] for r, _ in items if r["name_bn"]), None),
                                    "classes": cls, "length_km": round(u.length / 1000, 2), "segments": len(ids), "ids": ids,
                                    "lon": round(lon, 5), "lat": round(lat, 5), "bbox": bbox_wgs(u),
                                    "cells": [[k, round(v, 3)] for k, v in cells.items() if v > 0.01]})
        # water bodies
        rows = self.q("SELECT id, water_type, name, area_km2, ST_AsBinary(geom) g FROM geo.water_bodies ORDER BY id")
        self.write_json("vector/water_bodies.geojson", fc([
            {"type": "Feature", "id": r["id"], "properties": {"id": r["id"], "t": r["water_type"], "name": r["name"] or ""},
             "geometry": geom_to_wgs(wkb.loads(bytes(r["g"])))} for r in rows]))
        # land polygons for the offline basemap: every WorldCover class except water (80) and no-data (0), 100 m
        from shapely.geometry import Polygon, shape
        with rasterio.open(self.cog / "worldcover.tif") as src:
            wc = src.read(1)
            land = ((wc != 0) & (wc != 80)).astype(np.uint8)
            feats_land = []
            for geom, _ in features.shapes(land, mask=land == 1, transform=src.transform, connectivity=8):
                g = shape(geom)
                if g.area < 30000:
                    continue
                g = Polygon(g.exterior, [h for h in g.interiors if Polygon(h).area >= 30000]).simplify(45, preserve_topology=True)
                if not g.is_empty:
                    feats_land.append({"type": "Feature", "id": len(feats_land), "properties": {}, "geometry": geom_to_wgs(g, 0, 5)})
        self.write_json("vector/land.geojson", fc(feats_land))
        # mangrove patches (2016, 2025)
        for year in (2016, 2025):
            rows = self.q("SELECT id, area_km2, ST_AsBinary(geom) g FROM geo.mangrove_features WHERE year = %s AND class = 'mangrove'", (year,))
            self.write_json(f"vector/mangrove_{year}.geojson", fc([
                {"type": "Feature", "id": r["id"], "properties": {"a": round(r["area_km2"] or 0, 3)},
                 "geometry": geom_to_wgs(wkb.loads(bytes(r["g"])), 15)} for r in rows]))
        self.mangrove_patch_stats = {str(y): self.q("""SELECT count(*) n, round(sum(area_km2)::numeric, 1) km2,
                                                        round(max(area_km2)::numeric, 2) largest
                                                        FROM geo.mangrove_features WHERE year = %s AND class = 'mangrove'""", (y,))[0]
                                     for y in (2016, 2025)}
        for v in self.mangrove_patch_stats.values():
            for k in v:
                v[k] = float(v[k]) if v[k] is not None else None
        # jetties, places, services
        pts = {}
        rows = self.q("""SELECT id, name, kind, nearest_village, block_name, ST_X(geom_wgs) lon, ST_Y(geom_wgs) lat, ST_X(geom) x, ST_Y(geom) y
                         FROM geo.jetties ORDER BY id""")
        pts["jetty"] = rows
        rows2 = self.q("SELECT id, name, place_type, ST_X(geom_wgs) lon, ST_Y(geom_wgs) lat, ST_X(geom) x, ST_Y(geom) y FROM geo.places ORDER BY id")
        pts["place"] = rows2
        rows3 = self.q("SELECT id, name, amenity, category, ST_X(geom_wgs) lon, ST_Y(geom_wgs) lat, ST_X(geom) x, ST_Y(geom) y FROM geo.pois ORDER BY id")
        pts["poi"] = rows3
        self.points = {}
        for t, rs in pts.items():
            recs, feats = [], []
            for r in rs:
                _, hi = self.hex_tree.query([r["x"], r["y"]])
                rec = {k: v for k, v in r.items() if k not in ("x", "y")}
                rec["lon"], rec["lat"] = round(r["lon"], 6), round(r["lat"], 6)
                rec["cell"] = int(hi)
                recs.append(rec)
                props = {"id": r["id"], "name": r.get("name") or ""}
                for k in ("kind", "place_type", "amenity", "category"):
                    if r.get(k):
                        props[k] = r[k]
                feats.append({"type": "Feature", "id": r["id"], "properties": props,
                              "geometry": {"type": "Point", "coordinates": [rec["lon"], rec["lat"]]}})
            self.points[t] = recs
            self.write_json({"jetty": "vector/jetties.geojson", "place": "vector/places.geojson", "poi": "vector/services.geojson"}[t], fc(feats))
        # habitat patches and corridors (derived from the validated tiger model)
        rows = self.q("SELECT id, cell_count, area_km2, mean_suitability, ST_AsBinary(geom) g FROM intel.habitat_patches ORDER BY id")
        self.patches = [{"id": r["id"], "cells": r["cell_count"], "area_km2": round(r["area_km2"], 1),
                         "mean_suitability": round(r["mean_suitability"], 3)} for r in rows]
        self.write_json("vector/habitat_patches.geojson", fc([
            {"type": "Feature", "id": r["id"], "properties": {"id": r["id"], "area_km2": round(r["area_km2"], 1),
                                                             "suit": round(r["mean_suitability"], 3)},
             "geometry": geom_to_wgs(wkb.loads(bytes(r["g"])), 20)} for r in rows]))
        rows = self.q("""SELECT id, from_patch, to_patch, cost, length_km, mean_suitability, ST_AsBinary(geom) g
                         FROM intel.connectivity_corridors ORDER BY id""")
        self.corridors = [{"id": r["id"], "from": r["from_patch"], "to": r["to_patch"], "length_km": round(r["length_km"], 1),
                           "cost": round(r["cost"], 1), "mean_suitability": round(r["mean_suitability"], 3)} for r in rows]
        self.write_json("vector/corridors.geojson", fc([
            {"type": "Feature", "id": r["id"], "properties": {"id": r["id"], "from": r["from_patch"], "to": r["to_patch"],
                                                             "km": round(r["length_km"], 1)},
             "geometry": geom_to_wgs(wkb.loads(bytes(r["g"])), 20)} for r in rows]))
        log("vectors written")

    # ------------------------------------------------------------------ occurrence counts (hexagon-level only)
    def records(self):
        self.tiger_count = np.zeros(self.n)
        self.prey_count = np.zeros(self.n)
        for r in self.q("SELECT grid_id, count(*) n FROM intel.tiger_occurrences WHERE grid_id IS NOT NULL GROUP BY 1"):
            self.tiger_count[self.hex_index[r["grid_id"]]] = r["n"]
        for r in self.q("SELECT grid_id, count(*) n FROM intel.prey_occurrences WHERE grid_id IS NOT NULL GROUP BY 1"):
            self.prey_count[self.hex_index[r["grid_id"]]] = r["n"]
        years = self.q("SELECT min(observed_at)::text a, max(observed_at)::text b, count(*) n FROM intel.tiger_occurrences")[0]
        self.records_meta = {"tiger": {"records": int(self.tiger_count.sum()), "hexagons": int((self.tiger_count > 0).sum()),
                                       "first": years["a"], "last": years["b"]},
                             "prey": {"records": int(self.prey_count.sum()), "hexagons": int((self.prey_count > 0).sum())}}
        log("records", self.records_meta)

    # ------------------------------------------------------------------ routing: water grid, walk graph, transfers
    def routing(self):
        with rasterio.open(self.cog / "navigable_water.tif") as d:
            nav = d.read(1)
            tr = d.transform
            H, W = nav.shape
        with rasterio.open(self.cog / "channel_network.tif") as d:
            ch = d.read(1)
        core = features.rasterize([(g, 1) for g in self.core_geoms], out_shape=(H, W), transform=tr, fill=0, dtype="uint8")
        forest = features.rasterize([(g, 1) for g in self.forest_geoms], out_shape=(H, W), transform=tr, fill=0, dtype="uint8")
        low = (nav == 1) & (core == 0)
        high = ((nav == 1) | (nav == 2)) & (core == 0)
        st = np.ones((3, 3), dtype=bool)

        def big(mask):
            lab, n = ndimage.label(mask, structure=st)
            sizes = ndimage.sum(mask, lab, index=np.arange(1, n + 1))
            keep = np.zeros(n + 1, dtype=bool)
            keep[1:] = sizes >= MIN_WATER_COMPONENT
            return keep[lab]
        low_big, high_big = big(low), big(high)
        flags = (low.astype(np.uint8) | (high.astype(np.uint8) << 1) | ((core > 0).astype(np.uint8) << 2)
                 | ((ch == 1).astype(np.uint8) << 3) | ((ch == 2).astype(np.uint8) << 4) | ((forest > 0).astype(np.uint8) << 5)
                 | (low_big.astype(np.uint8) << 6) | (high_big.astype(np.uint8) << 7))
        gzwrite(OUT / "routing/water.bin.gz", flags.astype(np.uint8).tobytes())
        meta = {"width": W, "height": H, "x0": tr.c, "y0": tr.f, "dx": tr.a, "dy": tr.e, "crs": "EPSG:32645",
                "bits": {"low": 1, "high": 2, "core": 4, "main": 8, "creek": 16, "permit": 32, "low_big": 64, "high_big": 128},
                "cells_low": int(low_big.sum()), "cells_high": int(high_big.sum())}
        self.water = dict(flags=flags, tr=tr, W=W, H=H, low_big=low_big, high_big=high_big)
        log(f"water grid {W}x{H}: low={meta['cells_low']} high={meta['cells_high']}")

        # jetties -> nearest open water cell (per tide) within SNAP_WATER_M
        rows_xy = lambda m: np.argwhere(m)
        jet = self.points["jetty"]
        jxy = np.array([TO_UTM.transform(j["lon"], j["lat"]) for j in jet])
        snap = {}
        for tide, m in (("low", low_big), ("high", high_big)):
            rc = rows_xy(m)
            xs = tr.c + (rc[:, 1] + 0.5) * tr.a
            ys = tr.f + (rc[:, 0] + 0.5) * tr.e
            tree = cKDTree(np.c_[xs, ys])
            d, k = tree.query(jxy)
            snap[tide] = [int(rc[kk, 0] * W + rc[kk, 1]) if dd <= SNAP_WATER_M else -1 for dd, kk in zip(d, k)]
            # boat distance from the nearest jetty to every open-water cell (multi-source Dijkstra)
            idx = -np.ones(H * W, dtype=np.int64)
            lin = rc[:, 0] * W + rc[:, 1]
            idx[lin] = np.arange(len(lin))
            src, dst, wts = [], [], []
            for dr, dc, w in ((0, 1, 100.0), (1, 0, 100.0), (1, 1, 141.42), (1, -1, 141.42)):
                r2, c2 = rc[:, 0] + dr, rc[:, 1] + dc
                ok = (r2 >= 0) & (r2 < H) & (c2 >= 0) & (c2 < W)
                a = np.where(ok)[0]
                b = idx[r2[a] * W + c2[a]]
                good = b >= 0
                src.append(a[good]); dst.append(b[good]); wts.append(np.full(good.sum(), w))
            src = np.concatenate(src); dst = np.concatenate(dst); wts = np.concatenate(wts)
            N = len(lin)
            starts = [idx[s] for s in snap[tide] if s >= 0]
            S = N
            src = np.concatenate([src, np.full(len(starts), S)]); dst = np.concatenate([dst, np.array(starts)])
            wts = np.concatenate([wts, np.full(len(starts), 1e-6)])
            g = coo_matrix((wts, (src, dst)), shape=(N + 1, N + 1)).tocsr()
            dist = dijkstra(g, directed=False, indices=S)[:N]
            _, hx = self.hex_tree.query(np.c_[xs, ys])
            best = np.full(self.n, np.inf)
            np.minimum.at(best, hx, dist)
            best[~np.isfinite(best)] = np.nan
            setattr(self, f"boat_{tide}", best / 1000)
        transfers = []
        # walk graph
        nodes = self.q("SELECT id, ST_X(geom) x, ST_Y(geom) y FROM nav.walk_nodes ORDER BY id")
        nid = {r["id"]: i for i, r in enumerate(nodes)}
        nxy = np.array([[r["x"], r["y"]] for r in nodes])
        edges = self.q("SELECT id, source, target, length_m, restricted, ST_AsBinary(geom) g FROM nav.walk_edges ORDER BY id")
        es, et, el, ef, offs, coords = [], [], [], [], [0], []
        for e in edges:
            if e["source"] not in nid or e["target"] not in nid:
                continue
            g = wkb.loads(bytes(e["g"])).simplify(4.0, preserve_topology=False)
            pts = list(g.coords) if g.geom_type == "LineString" else [c for part in g.geoms for c in part.coords]
            es.append(nid[e["source"]]); et.append(nid[e["target"]]); el.append(e["length_m"]); ef.append(1 if e["restricted"] else 0)
            for x, y in pts:
                lon, lat = TO_WGS.transform(x, y)
                coords.append((int(round(lon * 1e6)), int(round(lat * 1e6))))
            offs.append(len(coords))
        es, et = np.array(es, dtype=np.uint32), np.array(et, dtype=np.uint32)
        el, ef = np.array(el, dtype=np.float32), np.array(ef, dtype=np.uint8)
        open_e = ef == 0
        gw = coo_matrix((np.ones(open_e.sum()), (es[open_e], et[open_e])), shape=(len(nodes), len(nodes)))
        ncomp, lab = connected_components(gw, directed=False)
        sizes = np.bincount(lab)
        node_big = (sizes[lab] >= MIN_WALK_COMPONENT).astype(np.uint8)
        nll = np.array([TO_WGS.transform(x, y) for x, y in nxy])
        nll_i = np.round(nll * 1e6).astype(np.int32)
        coords = np.array(coords, dtype=np.int32)
        offs = np.array(offs, dtype=np.uint32)
        buf = b"".join([nll_i.tobytes(), node_big.tobytes(), es.tobytes(), et.tobytes(), el.tobytes(), ef.tobytes(),
                        offs.tobytes(), coords.tobytes()])
        gzwrite(OUT / "routing/walk.bin.gz", buf)
        walk_meta = {"nodes": len(nodes), "edges": int(len(es)), "coords": int(len(coords)),
                     "layout": ["node_lonlat:int32x2", "node_big:uint8", "edge_source:uint32", "edge_target:uint32",
                                "edge_length:float32", "edge_restricted:uint8", "edge_offsets:uint32(edges+1)", "coords:int32x2"]}
        # jetty transfers: water cell (low / high) + walk node
        wtree = cKDTree(nxy[node_big == 1]) if node_big.any() else None
        big_idx = np.where(node_big == 1)[0]
        for i, (j, (x, y)) in enumerate(zip(jet, jxy)):
            k = -1
            if wtree is not None:
                d, kk = wtree.query([x, y])
                if d <= SNAP_WALK_M:
                    k = int(big_idx[kk])
            transfers.append({"jetty": j["id"], "name": j["name"], "lon": j["lon"], "lat": j["lat"], "walk": k,
                              "low": snap["low"][i], "high": snap["high"][i]})
        jdump(OUT / "routing/meta.json", {"water": meta, "walk": walk_meta, "transfers": transfers,
                                         "speeds": {"motor_boat": 8, "country_boat": 5, "walk": 4.5, "transfer_min": 10}})
        log(f"walk graph: {len(nodes)} nodes, {len(es)} edges, {len(coords)} vertices; jetties with walk link: "
            f"{sum(1 for t in transfers if t['walk'] >= 0)}")

    # ------------------------------------------------------------------ hexagon variables + series (quantised)
    def hex_columns(self):
        attrs = [h["attributes"] or {} for h in self.hex]
        special = {"__tiger_records": self.tiger_count, "__prey_records": self.prey_count, "__protection": self.protection,
                   "__boat_high": np.round(self.boat_high, 2), "__boat_low": np.round(self.boat_low, 2),
                   "__forest_share": self.forest_share}
        cols, header = [], []
        cat_used = set()
        for v in VARIABLES:
            src = v["src"]
            if isinstance(src, str) and src in special:
                arr = np.array(special[src], dtype=float)
            elif callable(src):
                arr = np.array([fnum(src(a)) if src(a) is not None else np.nan for a in attrs], dtype=float)
            else:
                arr = np.array([fnum(a.get(src)) if fnum(a.get(src)) is not None else np.nan for a in attrs], dtype=float)
            arr = arr * v.get("scale", 1)
            if v["kind"] in ("count",):
                arr = np.where(np.isnan(arr), 0, arr)
            finite = np.isfinite(arr)
            if finite.sum() == 0:
                log("  skip (no values):", v["key"]); continue
            cols.append(arr)
            cat_used.add(v["cat"])
            meta = {k: v[k] for k in v if k not in ("src", "scale")}
            meta.update(n=int(finite.sum()), min=float(np.nanmin(arr)), max=float(np.nanmax(arr)), mean=float(np.nanmean(arr)))
            header.append(meta)
        self.var_header = header
        blob, qmeta = self.quantise(cols)
        for h, q in zip(header, qmeta):
            h["q"] = q
        gzwrite(OUT / "hex/vars.bin.gz", blob)
        # series
        scols, sheader = [], []
        for s in SERIES:
            items = []
            for c in s["cols"]:
                arr = np.array([fnum(a.get(c)) if fnum(a.get(c)) is not None else np.nan for a in attrs], dtype=float) * s.get("scale", 1)
                items.append(arr)
            if not any(np.isfinite(a).any() for a in items):
                log("  skip series:", s["key"]); continue
            meta = {k: s[k] for k in s if k not in ("cols", "scale")}
            meta["col0"] = len(scols)
            scols.extend(items)
            sheader.append(meta)
        sblob, sq = self.quantise(scols)
        for m in sheader:
            m["q"] = sq[m["col0"]: m["col0"] + len(m["x"])]
        gzwrite(OUT / "hex/series.bin.gz", sblob)
        self.series_header = sheader
        log(f"hexagon variables: {len(header)} columns; series: {len(sheader)} groups / {len(scols)} columns")

    @staticmethod
    def quantise(cols):
        """Int16 columns: value = (q + 32000) * scale + min; q = -32768 means no data."""
        out, meta = [], []
        for arr in cols:
            fin = np.isfinite(arr)
            lo = float(np.nanmin(arr)) if fin.any() else 0.0
            hi = float(np.nanmax(arr)) if fin.any() else 0.0
            scale = (hi - lo) / 64000 if hi > lo else 1.0
            q = np.full(arr.shape, -32768, dtype=np.int16)
            q[fin] = (np.round((arr[fin] - lo) / scale) - 32000).astype(np.int16)
            out.append(q.tobytes())
            meta.append([lo, scale])
        return b"".join(out), meta

    def hex_files(self):
        feats = []
        for i, (r, g) in enumerate(zip(self.hex, self.hex_geom)):
            feats.append({"type": "Feature", "id": i, "properties": {"i": i}, "geometry": geom_to_wgs(g, 0, 5)})
        self.write_json("hex/grid.geojson", fc(feats))
        # study-area outline (union of the hexagons) for the offline basemap and map exports
        from shapely import union_all
        outline = union_all([g.buffer(1) for g in self.hex_geom]).buffer(-1)
        self.write_json("vector/study_area.geojson", fc([{"type": "Feature", "id": 1, "properties": {}, "geometry": geom_to_wgs(outline, 30, 5)}]))
        bidx = {n: k for k, n in enumerate(self.block_names)}
        didx = {n: k for k, n in enumerate(self.district_names)}
        meta = {
            "n": self.n,
            "id": [r["grid_id"] for r in self.hex],
            "lon": [round(r["lon"], 5) for r in self.hex],
            "lat": [round(r["lat"], 5) for r in self.hex],
            "area": [round(r["area_km2"] or 0, 4) for r in self.hex],
            "block": [bidx.get(r["block_name"], -1) for r in self.hex],
            "district": [didx.get(r["district_name"], -1) for r in self.hex],
            "island": [int(x) for x in self.hex_island],
            "blocks": self.block_names, "districts": self.district_names,
            "islands": [rec["name"] for rec in self.island_recs],
            "x": [round(float(v), 1) for v in self.hex_xy[:, 0]], "y": [round(float(v), 1) for v in self.hex_xy[:, 1]],
        }
        self.write_json("hex/meta.json", meta)

    # ------------------------------------------------------------------ search index
    def gazetteer(self):
        rows = self.q("""SELECT entity_type t, entity_id e, name, name_bn, alt_names, search_key, skeleton, alt_keys, district, block,
                                island, context, importance, population, ST_X(geom_wgs) lon, ST_Y(geom_wgs) lat,
                                ST_XMin(bbox_wgs) x0, ST_YMin(bbox_wgs) y0, ST_XMax(bbox_wgs) x1, ST_YMax(bbox_wgs) y1
                         FROM geo.gazetteer WHERE entity_type <> 'grid_cell' ORDER BY importance DESC, name""")
        out = []
        for r in rows:
            bb = [round(r["x0"], 5), round(r["y0"], 5), round(r["x1"], 5), round(r["y1"], 5)] if r["x0"] is not None else None
            out.append([r["t"], str(r["e"]), r["name"], r["name_bn"], r["search_key"], r["skeleton"], r["alt_keys"] or "",
                        r["context"], round(r["lon"], 5), round(r["lat"], 5), bb, round(r["importance"] or 0, 3), r["population"] or 0])
        self.write_json("search.json", {"fields": ["type", "id", "name", "name_bn", "key", "skel", "alt", "context", "lon", "lat",
                                                    "bbox", "imp", "pop"], "rows": out})
        log(f"gazetteer: {len(out)} names")

    # ------------------------------------------------------------------ entities for profiles
    def entities(self):
        self.write_json("entities/admin.json", {"districts": self.districts, "blocks": self.blocks})
        self.write_json("entities/villages.json", self.village_recs)
        self.write_json("entities/islands.json", self.island_recs)
        self.write_json("entities/protected.json", self.pa_recs)
        self.write_json("entities/rivers.json", self.river_recs)
        self.write_json("entities/points.json", self.points)
        # labels for the offline basemap
        feats = []
        for v in self.village_recs:
            feats.append({"type": "Feature", "properties": {"n": v["name"], "t": "town" if v["type"] == "Urban" else "village",
                                                            "r": v["population"] or 0}, "geometry": {"type": "Point", "coordinates": [v["lon"], v["lat"]]}})
        for b in self.blocks:
            feats.append({"type": "Feature", "properties": {"n": b["name"], "t": "block", "r": b["population"] or 0},
                          "geometry": {"type": "Point", "coordinates": [b["lon"], b["lat"]]}})
        for d in self.districts:
            feats.append({"type": "Feature", "properties": {"n": d["name"], "t": "district", "r": d["population"] or 0},
                          "geometry": {"type": "Point", "coordinates": [d["lon"], d["lat"]]}})
        for i in self.island_recs:
            if i["name"]:
                feats.append({"type": "Feature", "properties": {"n": i["name"], "t": "island", "r": int((i["area_km2"] or 0) * 10)},
                              "geometry": {"type": "Point", "coordinates": [i["lon"], i["lat"]]}})
        self.write_json("vector/labels.geojson", fc(feats))

    # ------------------------------------------------------------------ module content
    def modules(self):
        def card(key):
            r = self.q("""SELECT r.id, r.model_version, r.prediction_date::text pd, r.algorithm, r.validation, r.card, r.thresholds,
                                 m.name, m.unit FROM intel.prediction_runs r JOIN intel.models m ON m.id = r.model_id
                          WHERE m.key = %s AND r.label_type = 'real' ORDER BY r.id DESC LIMIT 1""", (key,))[0]
            c, v = r["card"] or {}, r["validation"] or {}
            lb = v.get("leaderboard") or []
            leader = v.get("leader")
            lrow = next((x for x in lb if x.get("model") == leader), {})
            return {
                "key": key, "run": r["id"], "name": r["name"], "version": r["model_version"], "date": r["pd"],
                "algorithm": c.get("final_model") or leader, "scheme": v.get("scheme"),
                "labels": c.get("labels"), "features": c.get("features_used"), "domain": c.get("domain"),
                "metric": c.get("primary_metric"), "spatial_cv": c.get("score_spatial_cv"), "sd": c.get("score_sd"),
                "random_cv": c.get("score_random_cv_optimistic"), "boyce": lrow.get("Boyce_pooled"), "tss": lrow.get("TSS_mean"),
                "thresholds": c.get("thresholds"),
                "leaderboard": [{"model": x.get("model"), "rank": x.get("rank"), "auc": x.get("ROC_AUC_mean"), "auc_sd": x.get("ROC_AUC_sd"),
                                 "boyce": x.get("Boyce_pooled"), "tss": x.get("TSS_mean"), "tied": x.get("tied_with_leader")}
                                for x in sorted(lb, key=lambda x: x.get("rank") or 99)],
                "friedman_p": (v.get("statistics") or {}).get("friedman_p"),
                "drivers": [{"feature": d["feature"], "label": DRIVER_LABELS.get(d["feature"], (d.get("friendly"),) * 2)[0],
                             "label_bn": DRIVER_LABELS.get(d["feature"], (d.get("friendly"),) * 2)[1], "importance": d["importance"]}
                            for d in (c.get("top_drivers") or [])],
                "themes": [{"key": k, "en": THEME_LABELS.get(k, (k, k))[0], "bn": THEME_LABELS.get(k, (k, k))[1], "pct": v}
                           for k, v in sorted((c.get("theme_share_pct") or {}).items(), key=lambda kv: -kv[1])],
            }
        species = self.q("""SELECT taxon_group, module, scientific_name, common_name_en, local_name_bn, local_name_latin, habitat,
                                   conservation_status, references_ FROM intel.species ORDER BY module, scientific_name""")
        sp = defaultdict(list)
        for s in species:
            sp[s["module"]].append({"group": s["taxon_group"], "scientific": s["scientific_name"], "common": s["common_name_en"],
                                    "local_bn": s["local_name_bn"], "local": s["local_name_latin"], "habitat": s["habitat"],
                                    "status": s["conservation_status"], "refs": s["references_"] or [],
                                    **SPECIES_FIX.get(s["scientific_name"], {})})
        jdump(OUT / "modules.json", {
            "tiger": {"models": [card("tiger_presence"), card("prey_presence")], "species": sp.get("tiger", []),
                      "patches": self.patches, "corridors": self.corridors, "records": self.records_meta},
            "fish": {"species": sp.get("fish", [])}, "crab": {"species": sp.get("crab", [])}, "honey": {"species": sp.get("honey", [])},
            "environment": {"mangrove_patches": self.mangrove_patch_stats},
        })
        self.files["modules.json"] = self.stat(OUT / "modules.json")
        log("modules written; species per module:", {k: len(v) for k, v in sp.items()})

    # ------------------------------------------------------------------ provenance for reports
    def sources(self):
        """Public data-source register shown in the site and cited in every report (curated, provider-level)."""
        self.write_json("sources.json", SOURCES)

    # ------------------------------------------------------------------ rasters -> WebP in Web Mercator
    def rasters(self):
        meta_rows = {r["key"]: r for r in self.q("SELECT key, title, colormap, classes, rescale_min, rescale_max FROM meta.raster_metadata")}
        RGB = {"landsat_truecolor_2025", "landsat_truecolor_2010", "landsat_falsecolor_2025", "terrain_shaded"}
        index = {}
        for tif in sorted(self.cog.glob("*.tif")):
            key = tif.stem
            m = meta_rows.get(key) or meta_rows.get(key.replace("_2016_2025", "").replace("_2017_2025", ""))
            if key == "mangrove_change_2016_2025":
                m = meta_rows.get("mangrove_change_2016_2025") or meta_rows.get("mangrove_change")
            with rasterio.open(tif) as src:
                dst_crs = "EPSG:3857"
                tr, w, h = calculate_default_transform(src.crs, dst_crs, src.width, src.height, *src.bounds)
                rgb = key in RGB
                cmap = (m or {}).get("colormap") or {}
                categorical = not rgb and "ramp" not in cmap and src.dtypes[0] == "uint8"
                rs = Resampling.nearest if categorical else Resampling.bilinear
                bands = [1, 2, 3] if rgb else [1]
                data = np.zeros((len(bands), h, w), dtype="float32")
                for k, b in enumerate(bands):
                    arr = src.read(b).astype("float32")
                    nd = src.nodata
                    if nd is not None and not (isinstance(nd, float) and math.isnan(nd)):
                        arr[arr == nd] = np.nan
                    reproject(arr, data[k], src_transform=src.transform, src_crs=src.crs, dst_transform=tr, dst_crs=dst_crs,
                              resampling=rs, src_nodata=np.nan, dst_nodata=np.nan)
                rgba = np.zeros((h, w, 4), dtype=np.uint8)
                legend = None
                if rgb:
                    valid = np.isfinite(data).all(axis=0) & (np.nan_to_num(data).sum(axis=0) > 0)
                    for k in range(3):
                        rgba[..., k] = np.clip(np.nan_to_num(data[k]), 0, 255).astype(np.uint8)
                    rgba[..., 3] = np.where(valid, 255, 0)
                elif categorical:
                    vals = np.nan_to_num(data[0], nan=0).astype(int)
                    items = []
                    for kv, col in cmap.items():
                        c = _hex(col)
                        sel = vals == int(kv)
                        rgba[sel] = c
                    for cl in (m or {}).get("classes") or []:
                        items.append({"v": cl["value"], "en": cl["label"], "colour": cl["colour"]})
                    legend = {"type": "categorical", "items": items}
                else:
                    ramp = [_hex(c) for c in cmap.get("ramp", ["#000000", "#ffffff"])]
                    lo, hi = float(m.get("rescale_min") or 0), float(m.get("rescale_max") or 1)
                    x = np.clip((data[0] - lo) / (hi - lo), 0, 1)
                    valid = np.isfinite(data[0])
                    pos = np.nan_to_num(x) * (len(ramp) - 1)
                    i0 = np.clip(np.floor(pos).astype(int), 0, len(ramp) - 2)
                    t = (pos - i0)[..., None]
                    rc = np.array(ramp, dtype=float)
                    col = rc[i0] * (1 - t) + rc[i0 + 1] * t
                    rgba[..., :3] = col[..., :3].astype(np.uint8)
                    rgba[..., 3] = np.where(valid, 255, 0)
                    legend = {"type": "ramp", "colours": cmap.get("ramp"), "min": lo, "max": hi}
                img = Image.fromarray(rgba, "RGBA")
                path = OUT / f"raster/{key}.webp"
                path.parent.mkdir(parents=True, exist_ok=True)
                if categorical:
                    img.save(path, "WEBP", lossless=True, method=6)
                else:
                    img.save(path, "WEBP", quality=88 if rgb else 90, method=6)
                w0, s0, e0, n0 = transform_bounds(dst_crs, "EPSG:4326", tr.c, tr.f + tr.e * h, tr.c + tr.a * w, tr.f)
                index[key] = {"url": f"raster/{key}.webp", "coordinates": [[w0, n0], [e0, n0], [e0, s0], [w0, s0]],
                              "bounds": [w0, s0, e0, n0], "width": w, "height": h, "legend": legend,
                              "title": (m or {}).get("title") or key}
                # thumbnails for the basemap gallery
                if key in RGB or key == "worldcover":
                    th = img.copy()
                    th.thumbnail((240, 240))
                    bg = Image.new("RGBA", th.size, (207, 226, 230, 255))
                    bg.alpha_composite(th)
                    bg.convert("RGB").save(OUT / f"raster/thumb_{key}.jpg", "JPEG", quality=82)
                    index[key]["thumb"] = f"raster/thumb_{key}.jpg"
                log(f"raster {key}: {w}x{h} -> {path.stat().st_size / 1e3:.0f} kB")
        self.write_json("raster/index.json", index)

    # ------------------------------------------------------------------ catalogue (layers + variables + categories)
    def catalogue(self):
        jdump(OUT / "catalog.json", {
            "categories": [{"key": k, "en": v[0], "bn": v[1]} for k, v in CATEGORIES.items()],
            "variables": self.var_header,
            "series": [{k: v for k, v in s.items()} for s in self.series_header],
            "study_area": {"hexagons": self.n, "area_km2": round(sum(h["area_km2"] or 0 for h in self.hex), 1),
                           "bbox": [87.9, 21.45, 89.3, 22.75]},
            "release": {"tag": self.q("SELECT release_tag FROM meta.data_releases WHERE is_active")[0]["release_tag"],
                        "exported": time.strftime("%Y-%m-%d")},
        })

    # ------------------------------------------------------------------ helpers
    def write_json(self, rel, obj):
        jdump(OUT / rel, obj)

    @staticmethod
    def stat(p: Path):
        return {"bytes": p.stat().st_size}

    def manifest(self):
        files = []
        for p in sorted(OUT.rglob("*")):
            if p.is_file() and p.name != "manifest.json":
                h = hashlib.sha1(p.read_bytes()).hexdigest()[:10]
                files.append({"path": str(p.relative_to(OUT)).replace("\\", "/"), "bytes": p.stat().st_size, "hash": h})
        version = hashlib.sha1("".join(f["hash"] for f in files).encode()).hexdigest()[:12]
        jdump(OUT / "manifest.json", {"version": version, "generated": time.strftime("%Y-%m-%dT%H:%M:%S"), "files": files,
                                     "total_bytes": sum(f["bytes"] for f in files)})
        log(f"manifest: {len(files)} files, {sum(f['bytes'] for f in files) / 1e6:.1f} MB, version {version}")


def _hex(c: str):
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="postgresql://dishari:dishari_dev@localhost:5432/dishari")
    ap.add_argument("--cog", default=str(ROOT.parent / "DISHARI_Platform" / "data" / "cog"))
    ap.add_argument("--clean", action="store_true", help="delete public/data first")
    ap.add_argument("--only", nargs="*", help="run only these steps (then rebuild the manifest), e.g. --only sources")
    a = ap.parse_args()
    if a.only:
        x = Exporter.__new__(Exporter)
        x.files = {}
        for step in a.only:
            getattr(x, step)()
        x.manifest()
        return
    if a.clean and OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)
    x = Exporter(a.db, Path(a.cog))
    x.load_hex()
    x.admin()
    x.islands()
    x.protected()
    x.villages()
    x.vectors()
    x.records()
    x.routing()
    x.hex_columns()
    x.hex_files()
    x.gazetteer()
    x.entities()
    x.modules()
    x.sources()
    x.rasters()
    x.catalogue()
    x.manifest()


if __name__ == "__main__":
    main()
