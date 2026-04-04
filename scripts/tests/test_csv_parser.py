import os
import pytest
from utils.csv_parser import parse_localdata_csv

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def test_parse_localdata_csv_returns_active_pharmacies():
    path = os.path.join(FIXTURE_DIR, "sample_localdata.csv")
    rows = parse_localdata_csv(path)
    assert len(rows) == 2

def test_parse_localdata_csv_field_extraction():
    path = os.path.join(FIXTURE_DIR, "sample_localdata.csv")
    rows = parse_localdata_csv(path)
    first = rows[0]
    assert first["id"] == "PHMD120001"
    assert first["name"] == "테스트약국"
    assert first["phone"] == "02-1234-5678"
    assert first["address"] == "서울특별시 강남구 역삼동 123"
    assert first["road_address"] == "서울특별시 강남구 테헤란로 10"
    assert first["business_status_code"] == "01"
    assert first["x_5174"] == 198236.123
    assert first["y_5174"] == 451234.567

def test_parse_localdata_csv_missing_coords():
    path = os.path.join(FIXTURE_DIR, "sample_localdata.csv")
    rows = parse_localdata_csv(path)
    third = rows[1]
    assert third["x_5174"] == 193786.830
    assert third["y_5174"] == 185954.519
