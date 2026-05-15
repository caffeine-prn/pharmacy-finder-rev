import os
from datetime import date

from sources.hira_pharmacy import (
    filter_hira_opclo_events,
    opclo_events_as_hira_candidates,
    parse_hira_opclo_xml,
    parse_hira_xml,
)

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def test_parse_hira_xml():
    xml_path = os.path.join(FIXTURE_DIR, "sample_hira_response.xml")
    with open(xml_path) as f:
        xml_text = f.read()
    items, total_count = parse_hira_xml(xml_text)
    assert total_count == 1
    assert len(items) == 1
    item = items[0]
    assert item["ykiho"] == "TESTYKIHO001"
    assert item["name"] == "테스트약국"
    assert item["longitude"] == 127.0312
    assert item["latitude"] == 37.4998
    assert item["sido"] == "서울"
    assert item["sigungu"] == "강남구"
    assert item["phone"] == "02-1234-5678"


def test_parse_hira_opclo_xml():
    xml_path = os.path.join(FIXTURE_DIR, "sample_hira_opclo_response.xml")
    with open(xml_path) as f:
        xml_text = f.read()
    items, total_count = parse_hira_opclo_xml(xml_text)
    assert total_count == 1
    assert len(items) == 1
    item = items[0]
    assert item["ykiho"] == "TESTYKIHO002"
    assert item["name"] == "테스트약국"
    assert item["event_type"] == "개업"
    assert item["event_date"] == "20260412"
    assert item["crtr_ym"] == "202604"


def test_filter_hira_opclo_events_by_baseline_date():
    events = [
        {"ykiho": "OLD", "event_date": "20260331", "event_type": "개업"},
        {"ykiho": "NEW", "event_date": "20260401", "event_type": "개업"},
        {"ykiho": "FUTURE", "event_date": "20260516", "event_type": "개업"},
    ]
    filtered = filter_hira_opclo_events(
        events,
        since=date(2026, 4, 1),
        until=date(2026, 5, 15),
    )
    assert [event["ykiho"] for event in filtered] == ["NEW"]


def test_opclo_open_events_become_hira_candidates():
    events = [
        {
            "ykiho": "YK-OPEN",
            "name": "새약국",
            "address": "서울특별시 강남구 테헤란로 10",
            "event_type": "개업",
            "event_date": "20260412",
        },
        {
            "ykiho": "YK-CLOSED",
            "name": "닫힌약국",
            "address": "서울특별시 강남구 테헤란로 11",
            "event_type": "폐업",
            "event_date": "20260413",
        },
    ]
    candidates = opclo_events_as_hira_candidates(events)
    assert len(candidates) == 1
    assert candidates[0]["ykiho"] == "YK-OPEN"
    assert candidates[0]["source"] == "hira_opclo"
