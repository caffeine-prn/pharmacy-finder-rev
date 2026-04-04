import os
from sources.hira_pharmacy import parse_hira_xml

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
