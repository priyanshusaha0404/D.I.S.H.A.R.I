"""Gallery thumbnails for the offline basemaps (drawn from the site's own vector data)."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "vector"
OUT = ROOT / "public" / "thumbs"
W, H = 256, 192
BBOX = (87.92, 21.45, 89.28, 22.77)
PAL = {
    "light": dict(outside="#e7e5de", sea="#c9dfe5", land="#f5f2e9", mangrove="#d3e5cc", water="#aed2de", district="#8a8473"),
    "dark": dict(outside="#141a18", sea="#0e2b34", land="#1a2621", mangrove="#1f3a2c", water="#174a5a", district="#5f7068"),
}


def px(lon, lat):
    x = (lon - BBOX[0]) / (BBOX[2] - BBOX[0]) * W
    y = (BBOX[3] - lat) / (BBOX[3] - BBOX[1]) * H
    return x, y


def polys(geom):
    t = geom["type"]
    if t == "Polygon":
        yield geom["coordinates"]
    elif t == "MultiPolygon":
        yield from geom["coordinates"]


def draw_fc(d: ImageDraw.ImageDraw, name, fill=None, outline=None, width=1, hole=None):
    fc = json.loads((DATA / name).read_text())
    for f in fc["features"]:
        if not f.get("geometry"):
            continue
        for rings in polys(f["geometry"]):
            ext = [px(*c) for c in rings[0]]
            if len(ext) >= 3:
                d.polygon(ext, fill=fill, outline=outline, width=width) if outline else d.polygon(ext, fill=fill)
            if hole:
                for r in rings[1:]:
                    pts = [px(*c) for c in r]
                    if len(pts) >= 3:
                        d.polygon(pts, fill=hole)


def render(theme):
    global W, H
    p = PAL[theme]
    img = Image.new("RGB", (W * 2, H * 2), p["outside"])
    big = ImageDraw.Draw(img)
    W, H = W * 2, H * 2
    draw_fc(big, "study_area.geojson", fill=p["sea"])
    draw_fc(big, "land.geojson", fill=p["land"], hole=p["sea"])
    draw_fc(big, "mangrove_2025.geojson", fill=p["mangrove"])
    draw_fc(big, "water_bodies.geojson", fill=p["water"])
    fc = json.loads((DATA / "districts.geojson").read_text())
    for f in fc["features"]:
        for rings in polys(f["geometry"]):
            big.line([px(*c) for c in rings[0]], fill=p["district"], width=3)
    W, H = W // 2, H // 2
    img = img.resize((W, H), Image.LANCZOS)
    img.save(OUT / ("delta.png" if theme == "light" else "delta-dark.png"), optimize=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    render("light")
    render("dark")
    blank = Image.new("RGB", (W, H), "#f7f6f2")
    d = ImageDraw.Draw(blank)
    for x in range(0, W, 16):
        d.line([(x, 0), (x, H)], fill="#ecebe6")
    for y in range(0, H, 16):
        d.line([(0, y), (W, y)], fill="#ecebe6")
    blank.save(OUT / "blank.png", optimize=True)
    print("thumbs written")
