"""MOIS data.go.kr pharmacy APIs.

These REST endpoints expose the same licensing dataset as LOCALDATA, but with
query filters and daily update metadata. The ZIP downloader remains useful as a
fallback; this module is the preferred source for freshness-sensitive syncs.
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any
from urllib.parse import unquote

import requests

PHARMACY_URL = "https://apis.data.go.kr/1741000/pharmacies/info"
ANIMAL_PHARMACY_URL = "https://apis.data.go.kr/1741000/animal_pharmacies/info"


def _blank_to_none(value: Any):
    if value is None:
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    return value


def _parse_float(value: Any):
    value = _blank_to_none(value)
    if value is None:
        return None
    return float(value)


def _parse_timestamp(value: str | None):
    value = _blank_to_none(value)
    if value is None:
        return None
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").isoformat()


def parse_mois_response(payload: dict) -> tuple[list[dict], int]:
    response = payload.get("response", {})
    header = response.get("header", {})
    code = str(header.get("resultCode", ""))
    if code not in ("0", "00"):
        raise ValueError(f"MOIS API error: {header.get('resultMsg', 'unknown')}")

    body = response.get("body", {})
    items = body.get("items", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]
    return items or [], int(body.get("totalCount", 0) or 0)


def normalize_mois_record(row: dict, source: str) -> dict | None:
    """Return an active pharmacy record shaped like the existing LOCALDATA parser."""
    if str(row.get("SALS_STTS_CD", "")).strip() != "01":
        return None

    return {
        "id": str(row.get("MNG_NO", "")).strip(),
        "name": str(row.get("BPLC_NM", "")).strip(),
        "address": str(row.get("LOTNO_ADDR", "")).strip(),
        "road_address": str(row.get("ROAD_NM_ADDR", "")).strip(),
        "phone": str(row.get("TELNO", "")).strip(),
        "open_date": str(row.get("LCPMT_YMD", "")).strip(),
        "mois_license_date": _blank_to_none(row.get("LCPMT_YMD")),
        "mois_closed_date": _blank_to_none(row.get("CLSBIZ_YMD")),
        "mois_detail_status_code": str(row.get("DTL_SALS_STTS_CD", "")).strip(),
        "mois_detail_status_name": str(row.get("DTL_SALS_STTS_NM", "")).strip(),
        "mois_data_updated_at": _parse_timestamp(row.get("DAT_UPDT_PNT")),
        "business_status_code": str(row.get("SALS_STTS_CD", "")).strip(),
        "business_status": str(row.get("SALS_STTS_NM", "")).strip(),
        "x_5174": _parse_float(row.get("CRD_INFO_X")),
        "y_5174": _parse_float(row.get("CRD_INFO_Y")),
        "source": "mois_api",
    }


def build_raw_rows(rows: list[dict], source: str) -> list[dict]:
    raw_rows = []
    for row in rows:
        mng_no = str(row.get("MNG_NO", "")).strip()
        if not mng_no:
            continue
        raw_rows.append({
            "source": source,
            "mng_no": mng_no,
            "name": str(row.get("BPLC_NM", "")).strip(),
            "status_code": str(row.get("SALS_STTS_CD", "")).strip(),
            "status_name": str(row.get("SALS_STTS_NM", "")).strip(),
            "detail_status_code": str(row.get("DTL_SALS_STTS_CD", "")).strip(),
            "detail_status_name": str(row.get("DTL_SALS_STTS_NM", "")).strip(),
            "license_date": _blank_to_none(row.get("LCPMT_YMD")),
            "closed_date": _blank_to_none(row.get("CLSBIZ_YMD")),
            "data_updated_at": _parse_timestamp(row.get("DAT_UPDT_PNT")),
            "last_modified_at": _parse_timestamp(row.get("LAST_MDFCN_PNT")),
            "opn_atmy_grp_cd": _blank_to_none(row.get("OPN_ATMY_GRP_CD")),
            "road_address": _blank_to_none(row.get("ROAD_NM_ADDR")),
            "lotno_address": _blank_to_none(row.get("LOTNO_ADDR")),
            "phone": _blank_to_none(row.get("TELNO")),
            "x_5174": _parse_float(row.get("CRD_INFO_X")),
            "y_5174": _parse_float(row.get("CRD_INFO_Y")),
            "raw": row,
        })
    return raw_rows


def fetch_mois_records(
    api_key: str,
    source: str,
    page_size: int = 100,
    delay: float = 0.2,
    filters: dict[str, str] | None = None,
    max_retries: int = 3,
    max_workers: int = 6,
) -> tuple[list[dict], list[dict]]:
    """Fetch all rows from a MOIS endpoint.

    Returns `(active_records, raw_rows)` where active_records are normalized for
    the existing sync pipeline and raw_rows preserve the source payload for DB
    audit/history use.
    """
    if source not in ("pharmacy", "animal_pharmacy"):
        raise ValueError("source must be pharmacy or animal_pharmacy")

    url = PHARMACY_URL if source == "pharmacy" else ANIMAL_PHARMACY_URL
    api_source = "pharmacy" if source == "pharmacy" else "animal_pharmacy"
    service_key = unquote(api_key)
    normalized: list[dict] = []
    raw_source_rows: list[dict] = []

    def fetch_page(page: int) -> tuple[int, list[dict], int]:
        params = {
            "serviceKey": service_key,
            "pageNo": page,
            "numOfRows": page_size,
            "returnType": "json",
        }
        if filters:
            params.update(filters)

        for attempt in range(max_retries):
            try:
                resp = requests.get(url, params=params, timeout=120)
                resp.raise_for_status()
                rows, total_count = parse_mois_response(resp.json())
                return page, rows, total_count
            except Exception:
                if attempt == max_retries - 1:
                    raise
                time.sleep((attempt + 1) * 3)
        raise RuntimeError("unreachable MOIS retry state")

    first_page, rows, total_count = fetch_page(1)
    raw_source_rows.extend(rows)
    for row in rows:
        record = normalize_mois_record(row, source=api_source)
        if record:
            normalized.append(record)
    print(f"  MOIS {api_source} page {first_page}: {len(raw_source_rows)}/{total_count}", flush=True)

    total_pages = (total_count + page_size - 1) // page_size
    if total_pages <= 1:
        return normalized, build_raw_rows(raw_source_rows, source=api_source)

    workers = max(1, min(max_workers, total_pages - 1))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_page = {
            executor.submit(fetch_page, page): page
            for page in range(2, total_pages + 1)
        }
        completed = len(raw_source_rows)
        for future in as_completed(future_to_page):
            page, rows, total_count = future.result()
            raw_source_rows.extend(rows)
            completed += len(rows)
            print(f"  MOIS {api_source} page {page}: {completed}/{total_count}", flush=True)
            for row in rows:
                record = normalize_mois_record(row, source=api_source)
                if record:
                    normalized.append(record)
            if delay:
                time.sleep(delay)

    return normalized, build_raw_rows(raw_source_rows, source=api_source)
