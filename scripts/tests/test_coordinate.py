import pytest
from transform.coordinate import convert_5174_to_wgs84, convert_batch


def test_convert_known_point():
    lon, lat = convert_5174_to_wgs84(193786.830, 185954.519)
    assert 126.8 < lon < 127.0
    assert 35.0 < lat < 35.2


def test_convert_seoul_point():
    lon, lat = convert_5174_to_wgs84(198236.123, 451234.567)
    assert 126.5 < lon < 127.5
    assert 37.0 < lat < 38.0


def test_convert_batch():
    records = [
        {"name": "A", "x_5174": 193786.830, "y_5174": 185954.519},
        {"name": "B", "x_5174": None, "y_5174": None},
        {"name": "C", "x_5174": 198236.123, "y_5174": 451234.567},
    ]
    result = convert_batch(records)
    assert result[0]["longitude"] is not None
    assert result[0]["latitude"] is not None
    assert result[1]["longitude"] is None
    assert result[1]["latitude"] is None
    assert result[2]["longitude"] is not None
