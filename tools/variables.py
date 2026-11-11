"""Curated catalogue of the hexagon variables published on the website.

Every entry comes from a real input layer (satellite, census, OpenStreetMap, WDPA, ocean reanalysis) or from a model trained
and validated on real occurrence records. Outputs of models trained on synthetic labels are deliberately absent.

Fields: key, src (attribute name or callable on the attribute dict), label/label_bn, unit/unit_bn, cat, digits,
scale (multiplier applied to the raw value), ramp, kind (cont | zone | count | class), source, period.
"""
from __future__ import annotations

ZONES_LMH = [{"v": 1, "en": "Low", "bn": "নিম্ন"}, {"v": 2, "en": "Medium", "bn": "মাঝারি"}, {"v": 3, "en": "High", "bn": "উচ্চ"}]
PROTECTION = [{"v": 1, "en": "Open (outside protected areas)", "bn": "উন্মুক্ত (সংরক্ষিত এলাকার বাইরে)"},
              {"v": 2, "en": "Protected area (Forest Department permit)", "bn": "সংরক্ষিত এলাকা (বন দপ্তরের অনুমতি)"},
              {"v": 3, "en": "National Park core (no public entry)", "bn": "জাতীয় উদ্যানের কোর (জনসাধারণের প্রবেশ নেই)"}]

CATEGORIES = {
    "wildlife": ("Wildlife & habitat", "বন্যপ্রাণী ও আবাস"),
    "vegetation": ("Mangrove & vegetation", "ম্যানগ্রোভ ও উদ্ভিদ"),
    "landcover": ("Land cover", "ভূমি আচ্ছাদন"),
    "water": ("Water & rivers", "জল ও নদী"),
    "coast": ("Coast & terrain", "উপকূল ও ভূমিরূপ"),
    "climate": ("Climate", "জলবায়ু"),
    "ocean": ("Estuary & sea", "মোহনা ও সমুদ্র"),
    "people": ("People & infrastructure", "জনবসতি ও পরিকাঠামো"),
    "access": ("Access & protection", "যাতায়াত ও সুরক্ষা"),
}

S_TIGER = "Tiger habitat model — logistic regression on cleaned tiger occurrence records, 10 km spatial-block cross-validation"
S_PREY = "Prey habitat model — weighted ensemble on chital occurrence records, 10 km spatial-block cross-validation"
S_MODIS_NDVI = "MODIS NDVI (MOD13), yearly composites"
S_S2 = "Sentinel-2 surface reflectance indices, yearly composites"
S_LANDSAT = "Landsat 8/9 land surface temperature"
S_MODIS_LST = "MODIS land surface temperature, seasonal means 2000–2025"
S_CHIRPS = "CHIRPS rainfall (satellite–gauge blend)"
S_WC = "ESA WorldCover land cover (10 m)"
S_JRC = "JRC Global Surface Water"
S_WATER = "Sentinel-based surface-water classification 2019–2025 (project processing)"
S_SHORE = "Shoreline change from Landsat water masks (project processing)"
S_MANGROVE = "Mangrove classification (Random Forest on Sentinel-2 / Landsat)"
S_OCEAN = "Ocean reanalysis (sea surface height, salinity, currents)"
S_SST = "Satellite sea-surface temperature, seasonal means"
S_CHL = "Satellite ocean colour (chlorophyll-a)"
S_SRTM = "SRTM digital elevation model"
S_GLO = "Copernicus GLO-30 digital elevation model"
S_POP = "WorldPop 2020 population (100 m)"
S_VIIRS = "VIIRS night-time lights"
S_OSM = "OpenStreetMap"
S_WDPA = "WDPA — World Database on Protected Areas (UNEP-WCMC & IUCN)"
S_IBTRACS = "IBTrACS cyclone tracks 2000–2024"
S_PHEN = "Sentinel-2 monthly NDVI phenology 2019–2025"
S_NET = "Boat network on navigable water (100 m), National Park core excluded — computed for this website"


def _land_share(a):
    """land = all WorldCover classes except permanent water (80)"""
    vals = [a.get(f"e06_worldcover__frac_c{k}") for k in (10, 20, 30, 40, 50, 60, 70, 90, 95, 100)]
    vals = [float(v) for v in vals if v is not None]
    return min(1.0, sum(vals)) if vals else None


def pct(key):
    return {"src": key, "scale": 100, "unit": "%", "unit_bn": "%"}


def km(key):
    return {"src": key, "scale": 0.001, "unit": "km", "unit_bn": "কিমি"}


def V(key, label, label_bn, cat, source, ramp="blue", digits=2, kind="cont", src=None, scale=1, unit="", unit_bn="",
      period=None, classes=None, desc=None, desc_bn=None, **extra):
    d = {"key": key, "src": src or key, "label": label, "label_bn": label_bn, "cat": cat, "source": source, "ramp": ramp,
         "digits": digits, "kind": kind, "scale": scale, "unit": unit, "unit_bn": unit_bn or unit, "period": period}
    if classes:
        d["classes"] = classes
    if desc:
        d["desc"] = desc
    if desc_bn:
        d["desc_bn"] = desc_bn
    d.update(extra)
    return d


VARIABLES = [
    # ------------------------------------------------------------------ wildlife (validated models + records)
    V("tiger_suit", "Tiger habitat suitability", "বাঘের আবাস উপযোগিতা", "wildlife", S_TIGER, "orange", 3,
      src="tiger_presence_pred", unit="index 0–1", unit_bn="সূচক ০–১",
      desc="Relative habitat suitability for the Royal Bengal tiger. Spatial-CV ROC-AUC 0.743 ± 0.103, Boyce index 0.818.",
      desc_bn="রয়েল বেঙ্গল টাইগারের আপেক্ষিক আবাস উপযোগিতা। স্থানিক ক্রস-ভ্যালিডেশন ROC-AUC ০.৭৪৩ ± ০.১০৩, বয়েস সূচক ০.৮১৮।"),
    V("tiger_zone", "Tiger habitat zone", "বাঘের আবাস অঞ্চল", "wildlife", S_TIGER, "orange", 0, kind="zone",
      src="D1_tiger_habitat_zone", classes=ZONES_LMH),
    V("tiger_unc", "Tiger model uncertainty (SD)", "বাঘ মডেলের অনিশ্চয়তা (SD)", "wildlife", S_TIGER, "purple", 3,
      src="tiger_presence_unc", unit="SD"),
    V("prey_suit", "Prey (chital) habitat suitability", "শিকার প্রাণীর (চিতল) আবাস উপযোগিতা", "wildlife", S_PREY, "green", 3,
      src="prey_presence_pred", unit="index 0–1", unit_bn="সূচক ০–১",
      desc="Habitat suitability for chital (spotted deer), the main prey of the tiger. Spatial-CV ROC-AUC 0.804, Boyce 0.837.",
      desc_bn="বাঘের প্রধান শিকার চিতল হরিণের আবাস উপযোগিতা। স্থানিক ক্রস-ভ্যালিডেশন ROC-AUC ০.৮০৪, বয়েস ০.৮৩৭।"),
    V("prey_zone", "Prey habitat zone", "শিকার প্রাণীর আবাস অঞ্চল", "wildlife", S_PREY, "green", 0, kind="zone",
      src="D2_prey_habitat_zone", classes=ZONES_LMH),
    V("prey_unc", "Prey model uncertainty (SD)", "শিকার মডেলের অনিশ্চয়তা (SD)", "wildlife", S_PREY, "purple", 3,
      src="prey_presence_unc", unit="SD"),
    V("cons_priority", "Conservation priority index", "সংরক্ষণ অগ্রাধিকার সূচক", "wildlife",
      "Tiger suitability × prey suitability × (1 − human exposure)", "green", 3, src="D5_conservation_priority",
      unit="index 0–1", unit_bn="সূচক ০–১"),
    V("cons_zone", "Conservation priority zone", "সংরক্ষণ অগ্রাধিকার অঞ্চল", "wildlife",
      "Tiger suitability × prey suitability × (1 − human exposure)", "green", 0, kind="zone",
      src="D5_conservation_priority_zone", classes=ZONES_LMH),
    V("human_exposure", "Human exposure index", "মানব উপস্থিতি সূচক", "people",
      "Weighted index of population, buildings, villages and night lights", "purple", 3, src="D3_human_exposure",
      unit="index 0–1", unit_bn="সূচক ০–১"),
    V("exposure_zone", "Human exposure zone", "মানব উপস্থিতি অঞ্চল", "people",
      "Weighted index of population, buildings, villages and night lights", "purple", 0, kind="zone",
      src="D3_human_exposure_zone", classes=ZONES_LMH),
    V("habitat_pressure", "Habitat pressure index", "আবাসস্থলে চাপের সূচক", "vegetation",
      "Weighted index of mangrove loss, greenness loss, erosion and human pressure", "red", 3, src="D12_habitat_pressure",
      unit="index 0–1", unit_bn="সূচক ০–১"),
    V("pressure_zone", "Habitat pressure zone", "আবাসস্থলে চাপের অঞ্চল", "vegetation",
      "Weighted index of mangrove loss, greenness loss, erosion and human pressure", "red", 0, kind="zone",
      src="D12_habitat_pressure_zone", classes=ZONES_LMH),
    V("tiger_records", "Tiger occurrence records", "বাঘের উপস্থিতির রেকর্ড", "wildlife", "Cleaned tiger occurrence records",
      "orange", 0, kind="count", src="__tiger_records", unit="records", unit_bn="রেকর্ড"),
    V("prey_records", "Prey occurrence records", "শিকার প্রাণীর উপস্থিতির রেকর্ড", "wildlife", "Chital occurrence records",
      "green", 0, kind="count", src="__prey_records", unit="records", unit_bn="রেকর্ড"),

    # ------------------------------------------------------------------ mangrove & vegetation
    V("mangrove_2016", "Mangrove cover 2016", "ম্যানগ্রোভ আচ্ছাদন ২০১৬", "vegetation", S_MANGROVE, "green", 1, period="2016",
      **pct("mangrove_rf_2016__frac_c1")),
    V("mangrove_2020", "Mangrove cover 2020", "ম্যানগ্রোভ আচ্ছাদন ২০২০", "vegetation", S_MANGROVE, "green", 1, period="2020",
      **pct("mangrove_rf_2020__frac_c1")),
    V("mangrove_2025", "Mangrove cover 2025", "ম্যানগ্রোভ আচ্ছাদন ২০২৫", "vegetation", S_MANGROVE, "green", 1, period="2025",
      **pct("mangrove_rf_2025__frac_c1")),
    V("mangrove_change", "Mangrove change 2016–2025", "ম্যানগ্রোভ পরিবর্তন ২০১৬–২০২৫", "vegetation", S_MANGROVE, "div_green", 1,
      src=lambda a: _diff(a, "mangrove_rf_2025__frac_c1", "mangrove_rf_2016__frac_c1"), scale=100,
      unit="percentage points", unit_bn="শতাংশ বিন্দু", period="2016–2025"),
    V("ndvi_modis_mean", "Greenness, MODIS NDVI (mean 2000–2025)", "সবুজতা, MODIS NDVI (গড় ২০০০–২০২৫)", "vegetation",
      S_MODIS_NDVI, "green", 3, src="e11_modis_ndvi__ndvi__mean", unit="NDVI", period="2000–2025"),
    V("ndvi_modis_2025", "Greenness, MODIS NDVI 2025", "সবুজতা, MODIS NDVI ২০২৫", "vegetation", S_MODIS_NDVI, "green", 3,
      src="e11_modis_ndvi__25_ndvi_2025", unit="NDVI", period="2025"),
    V("ndvi_modis_trend", "Greenness trend, MODIS NDVI per year", "সবুজতার প্রবণতা, MODIS NDVI প্রতি বছর", "vegetation",
      S_MODIS_NDVI, "div_green", 4, src="e11_modis_ndvi__ndvi__trend", unit="NDVI / year", unit_bn="NDVI / বছর",
      period="2000–2025"),
    V("ndvi_s2_2025", "Greenness, Sentinel-2 NDVI 2025", "সবুজতা, Sentinel-2 NDVI ২০২৫", "vegetation", S_S2, "green", 3,
      src="m3_s2_ndvi_ndwi_mndwi_2025__ndvi", unit="NDVI", period="2025"),
    V("ndvi_s2_trend", "Greenness trend, Sentinel-2 NDVI per year", "সবুজতার প্রবণতা, Sentinel-2 প্রতি বছর", "vegetation", S_S2,
      "div_green", 4, src="m3_s2_ndvi_ndwi_mndwi__ndvi__trend", unit="NDVI / year", unit_bn="NDVI / বছর", period="2015–2025"),
    V("ndvi_amplitude", "Seasonal greenness amplitude", "মৌসুমি সবুজতার পার্থক্য", "vegetation", S_PHEN, "green", 3,
      src="f08_phenology_final_epsg32645__ndvi_amplitude", unit="NDVI"),
    V("ndvi_peak_doy", "Day of peak greenness", "সর্বোচ্চ সবুজতার দিন", "vegetation", S_PHEN, "teal", 0,
      src="f08_phenology_final_epsg32645__peak_ndvi_doy", unit="day of year", unit_bn="বছরের দিন"),
    V("greenup_doy", "Green-up day", "সবুজ হওয়া শুরুর দিন", "vegetation", S_PHEN, "teal", 0,
      src="f08_phenology_final_epsg32645__greenup_doy", unit="day of year", unit_bn="বছরের দিন"),
    V("senescence_doy", "Senescence day", "সবুজতা কমা শুরুর দিন", "vegetation", S_PHEN, "teal", 0,
      src="f08_phenology_final_epsg32645__senescence_doy", unit="day of year", unit_bn="বছরের দিন"),
    V("season_length", "Growing-season length", "বৃদ্ধির মৌসুমের দৈর্ঘ্য", "vegetation", S_PHEN, "teal", 0,
      src="f08_phenology_final_epsg32645__phenology_length_day", unit="days", unit_bn="দিন"),
    V("ndwi_2025", "Water index NDWI 2025", "জল সূচক NDWI ২০২৫", "water", S_S2, "blue", 3,
      src="m3_s2_ndvi_ndwi_mndwi_2025__ndwi", unit="NDWI", period="2025"),
    V("mndwi_2025", "Modified water index MNDWI 2025", "পরিবর্তিত জল সূচক MNDWI ২০২৫", "water", S_S2, "blue", 3,
      src="m3_s2_ndvi_ndwi_mndwi_2025__mndwi", unit="MNDWI", period="2025"),

    # ------------------------------------------------------------------ land cover (ESA WorldCover shares)
    V("lc_tree", "Tree cover", "বৃক্ষ আচ্ছাদন", "landcover", S_WC, "green", 1, **pct("e06_worldcover__frac_c10")),
    V("lc_grass", "Grassland", "তৃণভূমি", "landcover", S_WC, "green", 1, **pct("e06_worldcover__frac_c30")),
    V("lc_crop", "Cropland", "কৃষিজমি", "landcover", S_WC, "brown", 1, **pct("e06_worldcover__frac_c40")),
    V("lc_built", "Built-up", "নির্মিত এলাকা", "landcover", S_WC, "red", 1, **pct("e06_worldcover__frac_c50")),
    V("lc_bare", "Bare / sparse vegetation", "অনাবৃত / বিরল উদ্ভিদ", "landcover", S_WC, "brown", 1, **pct("e06_worldcover__frac_c60")),
    V("lc_water", "Permanent water bodies", "স্থায়ী জলাশয়", "landcover", S_WC, "blue", 1, **pct("e06_worldcover__frac_c80")),
    V("lc_wetland", "Herbaceous wetland", "তৃণ জলাভূমি", "landcover", S_WC, "teal", 1, **pct("e06_worldcover__frac_c90")),
    V("lc_mangrove", "Mangroves (WorldCover)", "ম্যানগ্রোভ (WorldCover)", "landcover", S_WC, "green", 1, **pct("e06_worldcover__frac_c95")),

    # ------------------------------------------------------------------ water
    V("water_freq", "Water frequency 2019–2025", "জল থাকার হার ২০১৯–২০২৫", "water", S_WATER, "blue", 1,
      **pct("sundaram_waterfrequency_2019_2025"), period="2019–2025"),
    V("water_perm", "Permanent water", "স্থায়ী জল", "water", S_WATER, "blue", 1, **pct("sundaram_permanentwater_2019_2025__frac_c1")),
    V("water_tidal", "Seasonal tidal water", "মৌসুমি জোয়ারের জল", "water", S_WATER, "blue", 1,
      **pct("sundaram_seasonaltidalwater_2019_2025__frac_c1")),
    V("channel_main", "Main river channel", "প্রধান নদীখাত", "water", S_WATER, "blue", 1,
      **pct("sundaram_mainriverchannel_2019_2025__frac_c1")),
    V("channel_creek", "Small creeks", "ছোট খাঁড়ি", "water", S_WATER, "blue", 1, **pct("sundaram_smallcreeknetwork_2019_2025__frac_c1")),
    V("creek_network", "Creek and channel network", "খাঁড়ি ও নদীখাতের জাল", "water", S_WATER, "blue", 1,
      **pct("sundaram_creekchannelnetwork_2019_2025__frac_c1")),
    V("water_occ", "Surface-water occurrence (JRC)", "ভূপৃষ্ঠের জলের উপস্থিতি (JRC)", "water", S_JRC, "blue", 1,
      src="water_occurance", unit="%"),
    V("jrc_perm_2020", "Permanent water 2020 (JRC)", "স্থায়ী জল ২০২০ (JRC)", "water", S_JRC, "blue", 1, period="2020",
      **pct("jrc_waterclass_2020__frac_c3")),
    V("jrc_seas_2020", "Seasonal water 2020 (JRC)", "মৌসুমি জল ২০২০ (JRC)", "water", S_JRC, "blue", 1, period="2020",
      **pct("jrc_waterclass_2020__frac_c2")),
    V("s1_water_2025", "Water, Sentinel-1 radar 2025", "জল, Sentinel-1 রাডার ২০২৫", "water", "Sentinel-1 SAR water mask", "blue", 1,
      period="2025", **pct("water_mask_2025__water")),
    V("waterway_len", "Mapped waterway length", "মানচিত্রিত জলপথের দৈর্ঘ্য", "water", S_OSM, "blue", 2,
      src="len_osm_waterways", unit="km"),
    V("boat_high", "Boat distance from nearest ghat — high tide", "নিকটতম ঘাট থেকে নৌপথের দূরত্ব — জোয়ার", "access", S_NET,
      "teal", 1, src="__boat_high", unit="km", unit_bn="কিমি"),
    V("boat_low", "Boat distance from nearest ghat — low tide", "নিকটতম ঘাট থেকে নৌপথের দূরত্ব — ভাটা", "access", S_NET,
      "teal", 1, src="__boat_low", unit="km", unit_bn="কিমি"),

    # ------------------------------------------------------------------ coast & terrain
    V("erosion_0515", "Erosion 2005–2015", "ভাঙন ২০০৫–২০১৫", "coast", S_SHORE, "red", 2, period="2005–2015",
      **pct("sundaram_erosion_2005_2015__frac_c1")),
    V("erosion_1525", "Erosion 2015–2025", "ভাঙন ২০১৫–২০২৫", "coast", S_SHORE, "red", 2, period="2015–2025",
      **pct("sundaram_erosion_2015_2025__frac_c1")),
    V("accretion_0515", "Accretion 2005–2015", "চর গঠন ২০০৫–২০১৫", "coast", S_SHORE, "brown", 2, period="2005–2015",
      **pct("sundaram_accretion_2005_2015__frac_c1")),
    V("accretion_1525", "Accretion 2015–2025", "চর গঠন ২০১৫–২০২৫", "coast", S_SHORE, "brown", 2, period="2015–2025",
      **pct("sundaram_accretion_2015_2025__frac_c1")),
    V("elevation", "Elevation (SRTM)", "উচ্চতা (SRTM)", "coast", S_SRTM, "brown", 2,
      src="sundarban_srtm_dem_slope_utm45n__elevation", unit="m", unit_bn="মিটার"),
    V("elevation_glo30", "Elevation (Copernicus GLO-30)", "উচ্চতা (Copernicus GLO-30)", "coast", S_GLO, "brown", 2,
      src="sundarban_glo30_dem", unit="m", unit_bn="মিটার"),
    V("slope", "Slope", "ঢাল", "coast", S_SRTM, "brown", 2, src="sundarban_srtm_dem_slope_utm45n__slope",
      unit="degrees", unit_bn="ডিগ্রি"),

    # ------------------------------------------------------------------ climate
    V("lst_modis", "Land surface temperature (mean 2000–2025)", "ভূপৃষ্ঠের তাপমাত্রা (গড় ২০০০–২০২৫)", "climate", S_MODIS_LST,
      "orange", 1, src="e10_lst", unit="°C"),
    V("lst_winter", "Land surface temperature — winter", "ভূপৃষ্ঠের তাপমাত্রা — শীত", "climate", S_MODIS_LST, "orange", 1,
      src="e10_lst_winter_2000_2025", unit="°C", season="winter"),
    V("lst_premonsoon", "Land surface temperature — pre-monsoon", "ভূপৃষ্ঠের তাপমাত্রা — প্রাক-বর্ষা", "climate", S_MODIS_LST,
      "orange", 1, src="e10_lst_premonsoon_2000_2025", unit="°C", season="premonsoon"),
    V("lst_monsoon", "Land surface temperature — monsoon", "ভূপৃষ্ঠের তাপমাত্রা — বর্ষা", "climate", S_MODIS_LST, "orange", 1,
      src="e10_lst_monsoon_2000_2025", unit="°C", season="monsoon"),
    V("lst_postmonsoon", "Land surface temperature — post-monsoon", "ভূপৃষ্ঠের তাপমাত্রা — বর্ষা-পরবর্তী", "climate", S_MODIS_LST,
      "orange", 1, src="e10_lst_postmonsoon_2000_2025", unit="°C", season="postmonsoon"),
    V("lst_landsat_2025", "Land surface temperature 2025 (Landsat)", "ভূপৃষ্ঠের তাপমাত্রা ২০২৫ (Landsat)", "climate", S_LANDSAT,
      "orange", 1, src="d03_landsat_lst_2025", unit="°C", period="2025"),
    V("lst_landsat_trend", "Land surface temperature trend (Landsat)", "ভূপৃষ্ঠের তাপমাত্রার প্রবণতা (Landsat)", "climate",
      S_LANDSAT, "div_red", 3, src="d03_landsat_lst__trend", unit="°C / year", unit_bn="°C / বছর", period="2010–2025"),
    V("rain_annual", "Annual rainfall (mean 2010–2025)", "বার্ষিক বৃষ্টিপাত (গড় ২০১০–২০২৫)", "climate", S_CHIRPS, "blue", 0,
      src="d08_chirps_annual_rainfall__mean", unit="mm", unit_bn="মিমি"),
    V("rain_annual_2025", "Annual rainfall 2025", "বার্ষিক বৃষ্টিপাত ২০২৫", "climate", S_CHIRPS, "blue", 0,
      src="d08_chirps_annual_rainfall_2025", unit="mm", unit_bn="মিমি", period="2025"),
    V("rain_annual_trend", "Annual rainfall trend", "বার্ষিক বৃষ্টিপাতের প্রবণতা", "climate", S_CHIRPS, "div_blue", 1,
      src="d08_chirps_annual_rainfall__trend", unit="mm / year", unit_bn="মিমি / বছর", period="2010–2025"),
    V("rain_monsoon", "Monsoon rainfall (mean 2010–2025)", "বর্ষার বৃষ্টিপাত (গড় ২০১০–২০২৫)", "climate", S_CHIRPS, "blue", 0,
      src="d08_chirps_monsoon_rainfall__mean", unit="mm", unit_bn="মিমি"),
    V("rain_monsoon_trend", "Monsoon rainfall trend", "বর্ষার বৃষ্টিপাতের প্রবণতা", "climate", S_CHIRPS, "div_blue", 1,
      src="d08_chirps_monsoon_rainfall__trend", unit="mm / year", unit_bn="মিমি / বছর", period="2010–2025"),
    V("cyclone_dist", "Distance to nearest cyclone track", "নিকটতম ঘূর্ণিঝড়ের পথের দূরত্ব", "climate", S_IBTRACS, "purple", 1,
      **km("dist_d21_ibtracs_sundarban_tracks_2000_2024_shp")),
    V("cyclone_len", "Cyclone track length (2000–2024)", "ঘূর্ণিঝড়ের পথের দৈর্ঘ্য (২০০০–২০২৪)", "climate", S_IBTRACS, "purple", 2,
      src="len_d21_ibtracs_sundarban_tracks_2000_2024_shp", unit="km", unit_bn="কিমি"),

    # ------------------------------------------------------------------ estuary & sea
    V("sst_winter", "Sea-surface temperature — winter", "সমুদ্রপৃষ্ঠের তাপমাত্রা — শীত", "ocean", S_SST, "orange", 2,
      src="f05_sst_winter", unit="°C", season="winter"),
    V("sst_premonsoon", "Sea-surface temperature — pre-monsoon", "সমুদ্রপৃষ্ঠের তাপমাত্রা — প্রাক-বর্ষা", "ocean", S_SST, "orange", 2,
      src="f05_sst_premonsoon", unit="°C", season="premonsoon"),
    V("sst_monsoon", "Sea-surface temperature — monsoon", "সমুদ্রপৃষ্ঠের তাপমাত্রা — বর্ষা", "ocean", S_SST, "orange", 2,
      src="f05_sst_monsoon", unit="°C", season="monsoon"),
    V("sst_postmonsoon", "Sea-surface temperature — post-monsoon", "সমুদ্রপৃষ্ঠের তাপমাত্রা — বর্ষা-পরবর্তী", "ocean", S_SST,
      "orange", 2, src="f05_sst_postmonsoon", unit="°C", season="postmonsoon"),
    V("chl", "Chlorophyll-a", "ক্লোরোফিল-এ", "ocean", S_CHL, "green", 2, src="f06_chl_sundarbans", unit="mg/m³"),
    V("salinity", "Salinity (mean 2000–2025)", "লবণাক্ততা (গড় ২০০০–২০২৫)", "ocean", S_OCEAN, "teal", 2,
      src="sundarbans_salinity_current_2000_2025__so", unit="PSU"),
    V("current_2025", "Surface current speed 2025", "পৃষ্ঠ স্রোতের বেগ ২০২৫", "ocean", S_OCEAN, "teal", 3,
      src=lambda a: _speed(a, "sundarbans_current_2025__uo", "sundarbans_current_2025__vo"), unit="m/s", period="2025"),
    V("sea_level_2020", "Sea surface height 2020", "সমুদ্রপৃষ্ঠের উচ্চতা ২০২০", "ocean", S_OCEAN, "blue", 3,
      src="sundarbans_sealevel_2020", unit="m", unit_bn="মিটার", period="2020"),
    V("sea_level_2025", "Sea surface height 2025", "সমুদ্রপৃষ্ঠের উচ্চতা ২০২৫", "ocean", S_OCEAN, "blue", 3,
      src="sundarbans_sealevel_2025", unit="m", unit_bn="মিটার", period="2025"),

    # ------------------------------------------------------------------ people & infrastructure
    V("pop_density", "Population density (WorldPop 2020)", "জনঘনত্ব (WorldPop ২০২০)", "people", S_POP, "purple", 0,
      src="e17_worldpop_2020", scale=100, unit="people/km²", unit_bn="জন/বর্গকিমি", period="2020"),
    V("night_lights", "Night-time lights", "রাতের আলো", "people", S_VIIRS, "orange", 2, src="t05_viirs_sundarbans",
      unit="nW/cm²/sr"),
    V("buildings", "Mapped buildings", "মানচিত্রিত ভবন", "people", S_OSM, "purple", 0, kind="count",
      src="count_osm_buildings", unit="buildings", unit_bn="ভবন"),
    V("roads_len", "Road length", "রাস্তার দৈর্ঘ্য", "people", S_OSM, "brown", 2, src="len_osm_roads", unit="km", unit_bn="কিমি"),
    V("dist_road", "Distance to nearest road", "নিকটতম রাস্তার দূরত্ব", "people", S_OSM, "brown", 2, **km("dist_osm_roads")),
    V("dist_settlement", "Distance to nearest settlement", "নিকটতম জনবসতির দূরত্ব", "people", S_OSM, "brown", 2,
      **km("dist_osm_places")),
    V("dist_service", "Distance to nearest service point", "নিকটতম পরিষেবা কেন্দ্রের দূরত্ব", "people", S_OSM, "brown", 2,
      **km("dist_osm_pois")),

    # ------------------------------------------------------------------ access & protection
    V("protection", "Legal status", "আইনি অবস্থা", "access", S_WDPA, "protection", 0, kind="class", src="__protection",
      classes=PROTECTION),
    V("np_share", "National Park share", "জাতীয় উদ্যানের অংশ", "access", S_WDPA, "green", 1, **pct("cover_sundarban_nationalpark")),
    V("forest_share", "Forest compartment / sanctuary share", "বনাঞ্চল / অভয়ারণ্যের অংশ", "access", S_WDPA, "green", 1,
      src="__forest_share", scale=100, unit="%"),
    V("dist_np", "Distance to National Park", "জাতীয় উদ্যানের দূরত্ব", "access", S_WDPA, "green", 2,
      **km("dist_sundarban_nationalpark")),
    V("land_share", "Land share", "স্থলভাগের অংশ", "access", S_WC, "brown", 1, src=_land_share, scale=100, unit="%", unit_bn="%",
      desc="Share of the hexagon covered by land: every ESA WorldCover class except permanent water.",
      desc_bn="ষড়ভুজের যে অংশ স্থলভাগ: স্থায়ী জল ছাড়া ESA WorldCover-এর সব শ্রেণি।"),
]

# ---------------------------------------------------------------------- time series (per hexagon)
SERIES = [
    {"key": "ndvi_modis", "label": "Greenness (MODIS NDVI)", "label_bn": "সবুজতা (MODIS NDVI)", "unit": "NDVI", "source": S_MODIS_NDVI,
     "x": list(range(2000, 2026)), "cols": [f"e11_modis_ndvi__{y - 2000}_ndvi_{y}" for y in range(2000, 2026)], "digits": 3},
    {"key": "ndvi_s2", "label": "Greenness (Sentinel-2 NDVI)", "label_bn": "সবুজতা (Sentinel-2 NDVI)", "unit": "NDVI", "source": S_S2,
     "x": list(range(2015, 2026)), "cols": [f"m3_s2_ndvi_ndwi_mndwi_{y}__ndvi" for y in range(2015, 2026)], "digits": 3},
    {"key": "ndwi_s2", "label": "Water index (Sentinel-2 NDWI)", "label_bn": "জল সূচক (Sentinel-2 NDWI)", "unit": "NDWI", "source": S_S2,
     "x": list(range(2015, 2026)), "cols": [f"m3_s2_ndvi_ndwi_mndwi_{y}__ndwi" for y in range(2015, 2026)], "digits": 3},
    {"key": "mndwi_s2", "label": "Modified water index (MNDWI)", "label_bn": "পরিবর্তিত জল সূচক (MNDWI)", "unit": "MNDWI", "source": S_S2,
     "x": list(range(2015, 2026)), "cols": [f"m3_s2_ndvi_ndwi_mndwi_{y}__mndwi" for y in range(2015, 2026)], "digits": 3},
    {"key": "rain_annual", "label": "Annual rainfall (CHIRPS)", "label_bn": "বার্ষিক বৃষ্টিপাত (CHIRPS)", "unit": "mm", "unit_bn": "মিমি",
     "source": S_CHIRPS, "x": list(range(2010, 2026)), "cols": [f"d08_chirps_annual_rainfall_{y}" for y in range(2010, 2026)], "digits": 0},
    {"key": "rain_monsoon", "label": "Monsoon rainfall (CHIRPS)", "label_bn": "বর্ষার বৃষ্টিপাত (CHIRPS)", "unit": "mm", "unit_bn": "মিমি",
     "source": S_CHIRPS, "x": list(range(2010, 2026)), "cols": [f"d08_chirps_monsoon_rainfall_{y}" for y in range(2010, 2026)], "digits": 0},
    {"key": "lst_landsat", "label": "Land surface temperature (Landsat)", "label_bn": "ভূপৃষ্ঠের তাপমাত্রা (Landsat)", "unit": "°C",
     "source": S_LANDSAT, "x": [2010, 2015, 2020, 2025], "cols": [f"d03_landsat_lst_{y}" for y in (2010, 2015, 2020, 2025)], "digits": 2},
    {"key": "mangrove", "label": "Mangrove cover", "label_bn": "ম্যানগ্রোভ আচ্ছাদন", "unit": "%", "scale": 100, "source": S_MANGROVE,
     "x": [2016, 2020, 2025], "cols": [f"mangrove_rf_{y}__frac_c1" for y in (2016, 2020, 2025)], "digits": 1},
    {"key": "s1_water", "label": "Water (Sentinel-1 radar)", "label_bn": "জল (Sentinel-1 রাডার)", "unit": "%", "scale": 100,
     "source": "Sentinel-1 SAR water mask", "x": [2015, 2020, 2025], "cols": [f"water_mask_{y}__water" for y in (2015, 2020, 2025)], "digits": 1},
    {"key": "s1_vv", "label": "Radar backscatter VV (Sentinel-1)", "label_bn": "রাডার ব্যাকস্ক্যাটার VV (Sentinel-1)", "unit": "dB",
     "source": "Sentinel-1 SAR", "x": [2015, 2020, 2025], "cols": [f"sentinel1_vv_vh_{y}__vv" for y in (2015, 2020, 2025)], "digits": 2},
    {"key": "s1_vh", "label": "Radar backscatter VH (Sentinel-1)", "label_bn": "রাডার ব্যাকস্ক্যাটার VH (Sentinel-1)", "unit": "dB",
     "source": "Sentinel-1 SAR", "x": [2015, 2020, 2025], "cols": [f"sentinel1_vv_vh_{y}__vh" for y in (2015, 2020, 2025)], "digits": 2},
    {"key": "jrc_perm", "label": "Permanent water (JRC)", "label_bn": "স্থায়ী জল (JRC)", "unit": "%", "scale": 100, "source": S_JRC,
     "x": [2000, 2010, 2020], "cols": [f"jrc_waterclass_{y}__frac_c3" for y in (2000, 2010, 2020)], "digits": 1},
    {"key": "jrc_seas", "label": "Seasonal water (JRC)", "label_bn": "মৌসুমি জল (JRC)", "unit": "%", "scale": 100, "source": S_JRC,
     "x": [2000, 2010, 2020], "cols": [f"jrc_waterclass_{y}__frac_c2" for y in (2000, 2010, 2020)], "digits": 1},
    {"key": "sea_level", "label": "Sea surface height", "label_bn": "সমুদ্রপৃষ্ঠের উচ্চতা", "unit": "m", "unit_bn": "মিটার",
     "source": S_OCEAN, "x": [2020, 2025], "cols": ["sundarbans_sealevel_2020", "sundarbans_sealevel_2025"], "digits": 3},
    {"key": "phenology_clim", "label": "Monthly greenness cycle (mean 2019–2025)", "label_bn": "মাসিক সবুজতার চক্র (গড় ২০১৯–২০২৫)",
     "unit": "NDVI", "source": S_PHEN, "x": list(range(1, 13)), "xkind": "month",
     "cols": [f"f08_phenology__ndvi_{m:02d}__mean" for m in range(1, 13)], "digits": 3},
    {"key": "phenology", "label": "Monthly greenness (Sentinel-2 NDVI)", "label_bn": "মাসিক সবুজতা (Sentinel-2 NDVI)", "unit": "NDVI",
     "source": S_PHEN, "x": [f"{y}-{m:02d}" for y in range(2019, 2026) for m in range(1, 13)], "xkind": "yearmonth",
     "cols": [f"f08_phenology_{y}__{m - 1}_ndvi_{y}_{m:02d}" for y in range(2019, 2026) for m in range(1, 13)], "digits": 3},
]


def _num(a, k):
    v = a.get(k)
    return float(v) if isinstance(v, (int, float)) and v == v else None


def _diff(a, k1, k2):
    x, y = _num(a, k1), _num(a, k2)
    return None if x is None or y is None else x - y


def _speed(a, ku, kv):
    u, v = _num(a, ku), _num(a, kv)
    return None if u is None or v is None else (u * u + v * v) ** 0.5


# ---------------------------------------------------------------------- public source register (sites + reports)
# One row per provider dataset. "layers" names what the site builds from it.
SOURCES = [
    {"key": "census", "group": "people", "name": "Census of India 2011 — villages and towns", "provider": "Office of the Registrar General & Census Commissioner, India",
     "url": "https://censusindia.gov.in", "licence": "Government of India open data", "period": "2011", "resolution": "Village / town",
     "layers": "Village and town boundaries, population, households, sex ratio; block and district totals"},
    {"key": "admin", "group": "people", "name": "District and community development block boundaries", "provider": "Census of India 2011 codes; boundaries compiled by D.I.S.H.A.R.I",
     "url": "https://censusindia.gov.in", "licence": "Government of India open data", "period": "2011", "resolution": "Block",
     "layers": "District and block boundaries, area summaries"},
    {"key": "islands", "group": "people", "name": "Island inventory of the Sundarbans", "provider": "Survey of India and NRIS 1:50,000 layers (attributes); island polygons compiled by D.I.S.H.A.R.I",
     "url": "https://surveyofindia.gov.in", "licence": "As published by the Survey of India", "period": "—", "resolution": "1:50,000",
     "layers": "Island names, category, land area, hazards, nearest port"},
    {"key": "worldpop", "group": "people", "name": "WorldPop population 2020 (100 m)", "provider": "WorldPop, University of Southampton",
     "url": "https://www.worldpop.org", "licence": "CC BY 4.0", "period": "2020", "resolution": "100 m", "layers": "Population density per hexagon"},
    {"key": "viirs", "group": "people", "name": "VIIRS night-time lights", "provider": "NOAA / Earth Observation Group, Colorado School of Mines",
     "url": "https://eogdata.mines.edu/products/vnl/", "licence": "CC BY 4.0", "period": "Annual composite", "resolution": "≈ 500 m", "layers": "Night-time lights"},
    {"key": "osm", "group": "reference", "name": "OpenStreetMap", "provider": "OpenStreetMap contributors",
     "url": "https://www.openstreetmap.org/copyright", "licence": "ODbL 1.0", "period": "2026 extract", "resolution": "Vector",
     "layers": "Rivers, canals, water bodies, roads and paths (walking network), ghats and jetties, place names, services, buildings"},
    {"key": "wdpa", "group": "reference", "name": "World Database on Protected Areas (WDPA)", "provider": "UNEP-WCMC & IUCN — Protected Planet",
     "url": "https://www.protectedplanet.net", "licence": "WDPA terms of use", "period": "October 2026 release", "resolution": "Vector",
     "layers": "Sundarbans National Park, wildlife sanctuaries, reserve-forest compartments, World Heritage and Ramsar designations, legal status class"},
    {"key": "worldcover", "group": "landcover", "name": "ESA WorldCover 2021 v200", "provider": "European Space Agency (Zanaga et al., 2022)",
     "url": "https://esa-worldcover.org", "licence": "CC BY 4.0", "period": "2021", "resolution": "10 m", "layers": "Land-cover map and land-cover shares per hexagon"},
    {"key": "landsat", "group": "earth", "name": "Landsat Collection 2 Level-2", "provider": "U.S. Geological Survey / NASA",
     "url": "https://www.usgs.gov/landsat-missions", "licence": "Public domain", "period": "2005–2025", "resolution": "30 m",
     "layers": "True- and false-colour composites 2010 and 2025, land surface temperature, shoreline positions"},
    {"key": "sentinel2", "group": "earth", "name": "Copernicus Sentinel-2 MSI", "provider": "European Space Agency — Copernicus",
     "url": "https://dataspace.copernicus.eu", "licence": "Copernicus free and open data licence", "period": "2015–2025", "resolution": "10–20 m",
     "layers": "NDVI, NDWI and MNDWI composites, monthly NDVI phenology, mangrove classification"},
    {"key": "sentinel1", "group": "earth", "name": "Copernicus Sentinel-1 SAR", "provider": "European Space Agency — Copernicus",
     "url": "https://dataspace.copernicus.eu", "licence": "Copernicus free and open data licence", "period": "2015–2025", "resolution": "10 m",
     "layers": "Radar backscatter (VV, VH) and radar water mask"},
    {"key": "modis", "group": "earth", "name": "MODIS Terra / Aqua (MOD13 NDVI, MOD11 land surface temperature)", "provider": "NASA LP DAAC",
     "url": "https://lpdaac.usgs.gov", "licence": "Public domain", "period": "2000–2025", "resolution": "250 m – 1 km",
     "layers": "Yearly greenness 2000–2025, seasonal land surface temperature"},
    {"key": "jrc", "group": "water", "name": "JRC Global Surface Water", "provider": "European Commission Joint Research Centre (Pekel et al., 2016)",
     "url": "https://global-surface-water.appspot.com", "licence": "Free and open (cite Pekel et al., 2016)", "period": "1984–2021", "resolution": "30 m",
     "layers": "Water occurrence, permanent and seasonal water 2000, 2010, 2020"},
    {"key": "srtm", "group": "terrain", "name": "SRTM digital elevation model", "provider": "NASA / USGS", "url": "https://www.earthdata.nasa.gov",
     "licence": "Public domain", "period": "2000", "resolution": "30 m", "layers": "Elevation, slope, shaded terrain"},
    {"key": "glo30", "group": "terrain", "name": "Copernicus DEM GLO-30", "provider": "European Space Agency — Copernicus", "url": "https://dataspace.copernicus.eu",
     "licence": "Copernicus DEM licence", "period": "2011–2015", "resolution": "30 m", "layers": "Elevation (second model)"},
    {"key": "chirps", "group": "climate", "name": "CHIRPS v2 rainfall", "provider": "Climate Hazards Center, University of California, Santa Barbara",
     "url": "https://www.chc.ucsb.edu/data/chirps", "licence": "Public domain", "period": "2010–2025", "resolution": "0.05°", "layers": "Annual and monsoon rainfall, rainfall trends"},
    {"key": "ibtracs", "group": "climate", "name": "IBTrACS v4 tropical cyclone tracks", "provider": "NOAA National Centers for Environmental Information",
     "url": "https://www.ncei.noaa.gov/products/international-best-track-archive", "licence": "Public domain", "period": "2000–2024", "resolution": "Track points",
     "layers": "Distance to cyclone tracks, cyclone track length"},
    {"key": "ocean", "group": "ocean", "name": "Satellite sea-surface temperature, ocean colour and ocean reanalysis", "provider": "Satellite and reanalysis ocean products (seasonal means)",
     "url": None, "licence": "Open data", "period": "2020–2025", "resolution": "≈ 4–9 km",
     "layers": "Sea-surface temperature by season, chlorophyll-a, salinity, surface currents, sea surface height"},
    {"key": "tiger_records", "group": "wildlife", "name": "Tiger occurrence records 2004–2025", "provider": "Compiled and cleaned by D.I.S.H.A.R.I",
     "url": None, "licence": "Shown per hexagon", "period": "2004–2025", "resolution": "Hexagon (1.6 km²)", "layers": "Tiger records per hexagon; tiger habitat model training"},
    {"key": "prey_records", "group": "wildlife", "name": "Chital (spotted deer) occurrence records", "provider": "Compiled and cleaned by D.I.S.H.A.R.I",
     "url": None, "licence": "Shown per hexagon", "period": "—", "resolution": "Hexagon (1.6 km²)", "layers": "Prey records per hexagon; prey habitat model training"},
    {"key": "dishari", "group": "analysis", "name": "D.I.S.H.A.R.I analysis products", "provider": "D.I.S.H.A.R.I research (machine-learning pipeline v2, release v2026.10.05)",
     "url": None, "licence": "D.I.S.H.A.R.I", "period": "2016–2025", "resolution": "100 m and 1.6 km² hexagons",
     "layers": "Mangrove extent 2016 / 2020 / 2025, surface-water frequency, permanent and tidal water, river channels and creeks, navigable water at low and high tide, shoreline change, tiger and prey habitat models (spatial cross-validation), conservation priority, human exposure, habitat pressure, habitat patches and corridors, boat-access distance"},
    {"key": "openmeteo", "group": "live", "name": "Open-Meteo weather forecast and marine sea level", "provider": "Open-Meteo.com",
     "url": "https://open-meteo.com", "licence": "CC BY 4.0", "period": "Live (3-day forecast)", "resolution": "Model grid", "layers": "Weather forecast, sea level and tide times"},
    {"key": "basemaps", "group": "basemap", "name": "Online basemaps", "provider": "Esri, Maxar, Earthstar Geographics and the GIS User Community; OpenStreetMap contributors; CARTO; OpenTopoMap; EOX IT Services (Sentinel-2 cloudless, contains modified Copernicus Sentinel data); NASA GIBS",
     "url": None, "licence": "Provider terms (attribution shown on the map)", "period": "Live", "resolution": "Tiles", "layers": "Basemap gallery"},
]


# ---------------------------------------------------------------------- readable names for model drivers
DRIVER_LABELS = {
    "dist_sundarban_nationalpark": ("Distance to Sundarbans National Park", "সুন্দরবন জাতীয় উদ্যান থেকে দূরত্ব"),
    "cover_sundarban_nationalpark": ("National Park share of the hexagon", "ষড়ভুজে জাতীয় উদ্যানের অংশ"),
    "e10_lst": ("Land surface temperature", "ভূপৃষ্ঠের তাপমাত্রা"),
    "d08_chirps_annual_rainfall__latest": ("Annual rainfall (latest year)", "বার্ষিক বৃষ্টিপাত (সর্বশেষ বছর)"),
    "d08_chirps_annual_rainfall__mean": ("Annual rainfall (long-term mean)", "বার্ষিক বৃষ্টিপাত (দীর্ঘমেয়াদি গড়)"),
    "d08_chirps_monsoon_rainfall__mean": ("Monsoon rainfall (long-term mean)", "বর্ষার বৃষ্টিপাত (দীর্ঘমেয়াদি গড়)"),
    "d03_landsat_sr__sr_b1__trend": ("Landsat reflectance band 1 (trend per year)", "ল্যান্ডস্যাট প্রতিফলন ব্যান্ড ১ (বার্ষিক প্রবণতা)"),
    "d03_landsat_sr__sr_b4__mean": ("Landsat reflectance band 4 (long-term mean)", "ল্যান্ডস্যাট প্রতিফলন ব্যান্ড ৪ (দীর্ঘমেয়াদি গড়)"),
    "f08_phenology_final_epsg32645__greenup_doy": ("Green-up day of year (phenology)", "সবুজায়ন শুরুর দিন (ফেনোলজি)"),
    "f08_phenology_final_epsg32645__ndvi_auc": ("Seasonal greenness integral (phenology)", "ঋতুভিত্তিক সবুজতার সমষ্টি (ফেনোলজি)"),
    "sundarban_srtm_dem_slope_utm45n__slope": ("Slope (SRTM)", "ঢাল (SRTM)"),
    "sundaram_shoreline__frac_c1__latest": ("Shoreline class 1 share (latest)", "উপকূলরেখা শ্রেণি ১-এর অংশ (সর্বশেষ)"),
    "f08_phenology__ndvi_06__trend": ("June greenness (trend per year)", "জুন মাসের সবুজতা (বার্ষিক প্রবণতা)"),
    "dist_osm_places": ("Distance to named places", "নামযুক্ত স্থান থেকে দূরত্ব"),
    "dist_osm_pois": ("Distance to service points", "পরিষেবা কেন্দ্র থেকে দূরত্ব"),
    "e17_worldpop_2020": ("Population 2020 (WorldPop)", "জনসংখ্যা ২০২০ (WorldPop)"),
    "f05_sst_monsoon": ("Sea-surface temperature, monsoon", "সমুদ্রপৃষ্ঠের তাপমাত্রা, বর্ষা"),
}
THEME_LABELS = {
    "dem": ("Terrain", "ভূসংস্থান"), "lst": ("Land temperature", "ভূপৃষ্ঠের তাপমাত্রা"), "sst": ("Sea temperature", "সমুদ্রের তাপমাত্রা"),
    "rivers": ("Rivers", "নদী"), "cyclone": ("Cyclones", "ঘূর্ণিঝড়"), "landsat": ("Landsat reflectance", "ল্যান্ডস্যাট প্রতিফলন"),
    "mangrove": ("Mangrove", "ম্যানগ্রোভ"), "rainfall": ("Rainfall", "বৃষ্টিপাত"), "landcover": ("Land cover", "ভূমি আচ্ছাদন"),
    "phenology": ("Phenology", "ফেনোলজি"), "protected": ("Protected areas", "সংরক্ষিত এলাকা"), "sentinel1": ("Sentinel-1 radar", "সেন্টিনেল-১ রাডার"),
    "sentinel2": ("Sentinel-2 indices", "সেন্টিনেল-২ সূচক"), "shoreline": ("Shoreline", "উপকূলরেখা"), "modis_ndvi": ("MODIS greenness", "MODIS সবুজতা"),
    "population": ("Population", "জনসংখ্যা"), "settlements": ("Settlements", "বসতি"), "surface_water": ("Surface water", "ভূপৃষ্ঠের জল"),
    "nightlights": ("Night lights", "রাতের আলো"),
}
SPECIES_FIX = {"Axis axis": {"habitat": "Forest edges, grassy openings and the mangrove interior; the principal prey of the tiger."}}
