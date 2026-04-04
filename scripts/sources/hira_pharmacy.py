import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


def parse_hira_xml(xml_text: str) -> tuple[list[dict], int]:
    root = ET.fromstring(xml_text)
    result_code = root.findtext(".//resultCode", "")
    if result_code != "00":
        raise ValueError(f"HIRA API error: {root.findtext('.//resultMsg', 'unknown')}")
    total_count = int(root.findtext(".//totalCount", "0"))
    items = []
    for item in root.findall(".//item"):
        x_pos = item.findtext("XPos", "")
        y_pos = item.findtext("YPos", "")
        items.append({
            "ykiho": item.findtext("ykiho", ""),
            "name": item.findtext("yadmNm", ""),
            "category": item.findtext("clCdNm", ""),
            "sido": item.findtext("sidoCdNm", ""),
            "sigungu": item.findtext("sgguCdNm", ""),
            "address": item.findtext("addr", ""),
            "phone": item.findtext("telno", ""),
            "open_date": item.findtext("estbDd", ""),
            "longitude": float(x_pos) if x_pos else None,
            "latitude": float(y_pos) if y_pos else None,
        })
    return items, total_count


def fetch_all_hira_pharmacies(api_key: str, page_size: int = 100, delay: float = 1.0, max_retries: int = 3) -> list[dict]:
    encoded_key = urllib.parse.quote(api_key, safe="")
    base_url = "https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList"
    all_items = []
    page = 1
    while True:
        url = f"{base_url}?ServiceKey={encoded_key}&pageNo={page}&numOfRows={page_size}"
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=120) as resp:
                    xml_text = resp.read().decode("utf-8")
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 5
                    print(f"  HIRA page {page} attempt {attempt+1} failed: {e}, retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    raise
        items, total_count = parse_hira_xml(xml_text)
        all_items.extend(items)
        print(f"  HIRA page {page}: {len(all_items)}/{total_count}", flush=True)
        if len(all_items) >= total_count:
            break
        page += 1
        time.sleep(delay)
    return all_items
