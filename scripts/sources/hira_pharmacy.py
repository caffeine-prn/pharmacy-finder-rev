import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed


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


def _fetch_hira_page(
    base_url: str,
    encoded_key: str,
    page: int,
    page_size: int,
    max_retries: int,
) -> tuple[list[dict], int]:
    url = f"{base_url}?ServiceKey={encoded_key}&pageNo={page}&numOfRows={page_size}"
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                xml_text = resp.read().decode("utf-8")
            return parse_hira_xml(xml_text)
        except Exception as e:
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 5
                print(f"  HIRA page {page} attempt {attempt+1} failed: {e}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise
    return [], 0


def fetch_all_hira_pharmacies(
    api_key: str,
    page_size: int = 1000,
    delay: float = 0.1,
    max_retries: int = 3,
    max_workers: int = 4,
) -> list[dict]:
    encoded_key = urllib.parse.quote(api_key, safe="")
    base_url = "https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList"
    first_items, total_count = _fetch_hira_page(base_url, encoded_key, 1, page_size, max_retries)
    all_items = first_items[:]
    print(f"  HIRA page 1: {len(all_items)}/{total_count}", flush=True)
    if len(all_items) >= total_count:
        return all_items

    total_pages = (total_count + page_size - 1) // page_size
    workers = max(1, min(max_workers, total_pages - 1))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_fetch_hira_page, base_url, encoded_key, page, page_size, max_retries): page
            for page in range(2, total_pages + 1)
        }
        for future in as_completed(futures):
            page = futures[future]
            items, _ = future.result()
            all_items.extend(items)
            print(f"  HIRA page {page}: {len(all_items)}/{total_count}", flush=True)
            if delay:
                time.sleep(delay)

    return all_items
