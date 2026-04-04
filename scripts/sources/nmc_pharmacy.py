import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


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


def fetch_all_nmc_pharmacies(api_key: str, page_size: int = 100, delay: float = 1.0, max_retries: int = 3) -> list[dict]:
    encoded_key = urllib.parse.quote(api_key, safe="")
    base_url = "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire"
    all_items = []
    page = 1
    while True:
        url = f"{base_url}?ServiceKey={encoded_key}&pageNo={page}&numOfRows={page_size}"
        success = False
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=120) as resp:
                    xml_text = resp.read().decode("utf-8")
                items, total_count = parse_nmc_xml(xml_text)
                all_items.extend(items)
                print(f"  NMC page {page}: {len(all_items)}/{total_count}", flush=True)
                if len(all_items) >= total_count:
                    return all_items
                success = True
                break
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 5
                    print(f"  NMC page {page} attempt {attempt+1} failed: {e}, retrying in {wait}s...", flush=True)
                    time.sleep(wait)
                else:
                    print(f"  NMC page {page} failed after {max_retries} attempts: {e}, stopping", flush=True)
        if not success:
            break
        page += 1
        time.sleep(delay)
    return all_items
