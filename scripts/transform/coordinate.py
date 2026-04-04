from pyproj import Transformer

_transformer = Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)


def convert_5174_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """Convert EPSG:5174 (Bessel TM Korea Central) to WGS84 (lon, lat)."""
    lon, lat = _transformer.transform(x, y)
    return round(lon, 7), round(lat, 7)


def convert_batch(records: list[dict]) -> list[dict]:
    """Add longitude/latitude fields to records that have x_5174/y_5174."""
    for r in records:
        x, y = r.get("x_5174"), r.get("y_5174")
        if x is not None and y is not None:
            lon, lat = convert_5174_to_wgs84(x, y)
            r["longitude"] = lon
            r["latitude"] = lat
        else:
            r["longitude"] = None
            r["latitude"] = None
    return records
