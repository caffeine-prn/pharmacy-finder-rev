import json
import os
from load.cdn_json import generate_markers_json


def test_generate_markers_json(tmp_path):
    pharmacies = [
        {
            "id": "L1", "name": "테스트약국", "longitude": 127.0, "latitude": 37.5,
            "is_herbal_pharmacy": False, "is_animal_pharmacy": True,
            "is_cross_employed": False, "has_ykiho": True,
            "sido": "서울", "sigungu": "강남구", "phone": "02-1234-5678",
        },
        {
            "id": "L2", "name": "한방약국", "longitude": 126.9, "latitude": 37.4,
            "is_herbal_pharmacy": True, "is_animal_pharmacy": False,
            "is_cross_employed": False, "has_ykiho": False,
            "sido": "서울", "sigungu": "종로구", "phone": "",
        },
        {
            "id": "L3", "name": "좌표없음약국", "longitude": None, "latitude": None,
            "is_herbal_pharmacy": False, "is_animal_pharmacy": False,
            "is_cross_employed": False, "has_ykiho": True,
            "sido": "서울", "sigungu": "서초구", "phone": "",
        },
    ]

    out_path = str(tmp_path / "markers.json")
    generate_markers_json(pharmacies, out_path)

    with open(out_path) as f:
        data = json.load(f)

    assert data["count"] == 2  # L3 excluded (no coords)
    assert "generated_at" in data
    assert len(data["pharmacies"]) == 2
    first = data["pharmacies"][0]
    assert first["id"] == "L1"
    assert first["n"] == "테스트약국"
    assert first["lng"] == 127.0
    assert first["lat"] == 37.5
    assert first["a"] is True
    assert first["h"] is False
