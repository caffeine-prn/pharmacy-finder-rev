import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime


OPCLO_BASE_URL = "https://apis.data.go.kr/B551182/yadmOpCloInfoService2/getHospPharmacyOpCloList1"
PHARMACY_BASE_URL = "https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList"


def _blank_to_none(value: str | None):
    if value is None:
        return None
    value = value.strip()
    return value or None


def _parse_yyyymmdd(value: str | None):
    value = _blank_to_none(value)
    if value is None:
        return None
    return datetime.strptime(value, "%Y%m%d").date()


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
    first_items, total_count = _fetch_hira_page(PHARMACY_BASE_URL, encoded_key, 1, page_size, max_retries)
    all_items = first_items[:]
    print(f"  HIRA page 1: {len(all_items)}/{total_count}", flush=True)
    if len(all_items) >= total_count:
        return all_items

    total_pages = (total_count + page_size - 1) // page_size
    workers = max(1, min(max_workers, total_pages - 1))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_fetch_hira_page, PHARMACY_BASE_URL, encoded_key, page, page_size, max_retries): page
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


def parse_hira_opclo_xml(xml_text: str) -> tuple[list[dict], int]:
    root = ET.fromstring(xml_text)
    result_code = root.findtext(".//resultCode", "")
    if result_code != "00":
        raise ValueError(f"HIRA op/clo API error: {root.findtext('.//resultMsg', 'unknown')}")
    total_count = int(root.findtext(".//totalCount", "0"))
    items = []
    for item in root.findall(".//item"):
        event_type = item.findtext("estbCnclTp", "")
        event_date_raw = item.findtext("estbDd", "")
        items.append({
            "ykiho": item.findtext("ykiho", ""),
            "name": item.findtext("yadmNm", ""),
            "category": item.findtext("clCdNm", ""),
            "sido": item.findtext("sidoCdNm", ""),
            "sido_code": item.findtext("sidoCd", ""),
            "address": item.findtext("addr", ""),
            "phone": item.findtext("telno", ""),
            "event_type": event_type,
            "event_date": event_date_raw,
            "crtr_ym": item.findtext("crtrYm", ""),
            "opclo_type": event_type,
            "raw": {child.tag: child.text for child in item},
        })
    return items, total_count


def _fetch_hira_opclo_page(
    encoded_key: str,
    page: int,
    page_size: int,
    opclo_type: str,
    crtr_ym: str,
    max_retries: int,
) -> tuple[list[dict], int]:
    query = urllib.parse.urlencode({
        "pageNo": page,
        "numOfRows": page_size,
        "crtrYm": crtr_ym,
        "yadmTp": "2",
        "opCloTp": opclo_type,
    })
    url = f"{OPCLO_BASE_URL}?ServiceKey={encoded_key}&{query}"
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                xml_text = resp.read().decode("utf-8")
            return parse_hira_opclo_xml(xml_text)
        except Exception as e:
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 5
                print(f"  HIRA op/clo page {page} type {opclo_type} attempt {attempt+1} failed: {e}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise
    return [], 0


def _fetch_all_hira_opclo_type(
    encoded_key: str,
    opclo_type: str,
    crtr_ym: str,
    page_size: int,
    delay: float,
    max_retries: int,
    max_workers: int,
) -> list[dict]:
    first_items, total_count = _fetch_hira_opclo_page(
        encoded_key, 1, page_size, opclo_type, crtr_ym, max_retries
    )
    all_items = first_items[:]
    print(f"  HIRA op/clo type {opclo_type} page 1: {len(all_items)}/{total_count}", flush=True)
    if len(all_items) >= total_count:
        return all_items

    total_pages = (total_count + page_size - 1) // page_size
    workers = max(1, min(max_workers, total_pages - 1))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(
                _fetch_hira_opclo_page,
                encoded_key,
                page,
                page_size,
                opclo_type,
                crtr_ym,
                max_retries,
            ): page
            for page in range(2, total_pages + 1)
        }
        for future in as_completed(futures):
            page = futures[future]
            items, _ = future.result()
            all_items.extend(items)
            print(f"  HIRA op/clo type {opclo_type} page {page}: {len(all_items)}/{total_count}", flush=True)
            if delay:
                time.sleep(delay)
    return all_items


def filter_hira_opclo_events(
    events: list[dict],
    since: date | None,
    until: date | None,
) -> list[dict]:
    filtered = []
    for event in events:
        event_date = _parse_yyyymmdd(event.get("event_date"))
        if event_date is None:
            continue
        if since and event_date < since:
            continue
        if until and event_date > until:
            continue
        filtered.append(event)
    return filtered


def fetch_hira_opclo_events(
    api_key: str,
    since: date | None = None,
    until: date | None = None,
    crtr_ym: str | None = None,
    page_size: int = 1000,
    delay: float = 0.1,
    max_retries: int = 3,
    max_workers: int = 4,
) -> list[dict]:
    """Fetch HIRA pharmacy opening/closing/suspension events.

    The public API's server-side `crtrYm` behavior is not reliable enough to use
    as the only filter, so callers should pass a baseline `since` date and this
    function will filter by `estbDd` locally.
    """
    encoded_key = urllib.parse.quote(api_key, safe="")
    crtr_ym = crtr_ym or datetime.now().strftime("%Y%m")
    all_events = []
    for opclo_type in ("0", "1", "2", "3"):
        events = _fetch_all_hira_opclo_type(
            encoded_key,
            opclo_type,
            crtr_ym,
            page_size,
            delay,
            max_retries,
            max_workers,
        )
        all_events.extend(events)
    return filter_hira_opclo_events(all_events, since=since, until=until)


def opclo_events_as_hira_candidates(events: list[dict]) -> list[dict]:
    candidates = []
    for event in events:
        if event.get("event_type") != "개업" or not event.get("ykiho"):
            continue
        candidates.append({
            "ykiho": event.get("ykiho", ""),
            "name": event.get("name", ""),
            "category": event.get("category", "약국"),
            "sido": event.get("sido", ""),
            "sigungu": "",
            "address": event.get("address", ""),
            "phone": event.get("phone", ""),
            "open_date": event.get("event_date", ""),
            "longitude": None,
            "latitude": None,
            "source": "hira_opclo",
        })
    return candidates
