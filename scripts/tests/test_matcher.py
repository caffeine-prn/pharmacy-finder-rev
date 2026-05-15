from transform.matcher import (
    apply_hira_opclo_status,
    match_localdata_to_hira,
    match_to_animal,
    classify_herbal,
)


def test_exact_name_address_match():
    localdata = [
        {"id": "L1", "name": "테스트약국", "address": "서울특별시 강남구 역삼동 123",
         "road_address": "서울특별시 강남구 테헤란로 10", "longitude": 127.0, "latitude": 37.5},
    ]
    hira = [
        {"ykiho": "YK001", "name": "테스트약국", "address": "서울특별시 강남구 테헤란로 10, (역삼동)",
         "sido": "서울", "sigungu": "강남구", "open_date": "20200101",
         "longitude": 127.0, "latitude": 37.5},
    ]
    matched, unmatched = match_localdata_to_hira(localdata, hira)
    assert len(matched) == 1
    assert matched[0]["ykiho"] == "YK001"
    assert matched[0]["hira_open_date"] == "20200101"
    assert len(unmatched) == 0


def test_unmatched_flagged():
    localdata = [
        {"id": "L2", "name": "한방전문약국", "address": "서울특별시 종로구 관철동 50",
         "road_address": "", "longitude": 126.9, "latitude": 37.5},
    ]
    hira = []
    matched, unmatched = match_localdata_to_hira(localdata, hira)
    assert len(matched) == 0
    assert len(unmatched) == 1
    assert unmatched[0]["has_ykiho"] is False


def test_match_to_animal():
    pharmacies = [
        {"id": "L1", "name": "우리약국", "address": "서울특별시 강남구 역삼동 123",
         "longitude": 127.0, "latitude": 37.5},
    ]
    animals = [
        {"id": "A1", "name": "우리약국", "address": "서울특별시 강남구 역삼동 123",
         "longitude": 127.0, "latitude": 37.5},
    ]
    result, unmatched_animals = match_to_animal(pharmacies, animals)
    assert result[0]["is_animal_pharmacy"] is True
    assert len(unmatched_animals) == 0


def test_classify_herbal():
    pharmacies = [
        {"id": "L1", "ykiho": "YK001", "name": "예담한약국"},
        {"id": "L2", "ykiho": "YK002", "name": "일반약국"},
        {"id": "L3", "ykiho": None, "name": "한방약국"},
    ]
    staff = {
        "YK001": {"pharmacist": 0, "herbal_pharmacist": 1},
        "YK002": {"pharmacist": 2, "herbal_pharmacist": 1},
    }
    result = classify_herbal(pharmacies, staff)
    assert result[0]["is_herbal_pharmacy"] is True
    assert result[0]["is_cross_employed"] is False
    assert result[1]["is_herbal_pharmacy"] is True
    assert result[1]["is_cross_employed"] is True
    assert result[2]["is_herbal_pharmacy"] is False


def test_apply_hira_opclo_status_marks_suspended():
    pharmacies = [
        {"id": "L1", "ykiho": "YK001", "name": "테스트약국", "business_status": "영업중"},
    ]
    events = [
        {"ykiho": "YK001", "event_type": "개업", "event_date": "20260401"},
        {"ykiho": "YK001", "event_type": "휴업", "event_date": "20260501"},
    ]
    result = apply_hira_opclo_status(pharmacies, events)
    assert result[0]["hira_opclo_event_type"] == "휴업"
    assert result[0]["hira_last_event_type"] == "휴업"
    assert result[0]["hira_last_event_date"] == "20260501"
    assert result[0]["business_status"] == "휴업"
    assert result[0]["business_status_code"] == "02"
