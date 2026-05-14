import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed


def _format_hours(start: str, close: str):
    if not start or not close:
        return None
    return f"{start[:2]}:{start[2:]}-{close[:2]}:{close[2:]}"


def parse_nmc_xml(xml_text: str) -> tuple[list[dict], int]:
    root = ET.fromstring(xml_text)
    result_code = root.findtext(".//resultCode", "")
    if result_code != "00":
        raise ValueError(f"NMC API error: {root.findtext('.//resultMsg', 'unknown')}")
    total_count = int(root.findtext(".//totalCount", "0"))
    items = []
    for item in root.findall(".//item"):
        lat = item.findtext("wgs84Lat", "")
        lon = item.findtext("wgs84Lon", "")
        items.append({
            "hpid": item.findtext("hpid", ""),
            "name": item.findtext("dutyName", "").strip(),
            "address": item.findtext("dutyAddr", "").strip(),
            "phone": item.findtext("dutyTel1", ""),
            "longitude": float(lon) if lon else None,
            "latitude": float(lat) if lat else None,
            "hours_mon": _format_hours(item.findtext("dutyTime1s", ""), item.findtext("dutyTime1c", "")),
            "hours_tue": _format_hours(item.findtext("dutyTime2s", ""), item.findtext("dutyTime2c", "")),
            "hours_wed": _format_hours(item.findtext("dutyTime3s", ""), item.findtext("dutyTime3c", "")),
            "hours_thu": _format_hours(item.findtext("dutyTime4s", ""), item.findtext("dutyTime4c", "")),
            "hours_fri": _format_hours(item.findtext("dutyTime5s", ""), item.findtext("dutyTime5c", "")),
            "hours_sat": _format_hours(item.findtext("dutyTime6s", ""), item.findtext("dutyTime6c", "")),
            "hours_sun": _format_hours(item.findtext("dutyTime7s", ""), item.findtext("dutyTime7c", "")),
            "hours_hol": _format_hours(item.findtext("dutyTime8s", ""), item.findtext("dutyTime8c", "")),
        })
    return items, total_count


def _fetch_nmc_page(
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
            return parse_nmc_xml(xml_text)
        except Exception as e:
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 5
                print(f"  NMC page {page} attempt {attempt+1} failed: {e}, retrying in {wait}s...", flush=True)
                time.sleep(wait)
            else:
                raise
    return [], 0


def fetch_all_nmc_pharmacies(
    api_key: str,
    page_size: int = 1000,
    delay: float = 0.1,
    max_retries: int = 3,
    max_workers: int = 4,
) -> list[dict]:
    encoded_key = urllib.parse.quote(api_key, safe="")
    base_url = "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire"
    first_items, total_count = _fetch_nmc_page(base_url, encoded_key, 1, page_size, max_retries)
    all_items = first_items[:]
    print(f"  NMC page 1: {len(all_items)}/{total_count}", flush=True)
    if len(all_items) >= total_count:
        return all_items

    total_pages = (total_count + page_size - 1) // page_size
    workers = max(1, min(max_workers, total_pages - 1))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_fetch_nmc_page, base_url, encoded_key, page, page_size, max_retries): page
            for page in range(2, total_pages + 1)
        }
        for future in as_completed(futures):
            page = futures[future]
            items, _ = future.result()
            all_items.extend(items)
            print(f"  NMC page {page}: {len(all_items)}/{total_count}", flush=True)
            if delay:
                time.sleep(delay)

    return all_items
