#!/usr/bin/env python3
"""Daily pharmacy data sync orchestrator."""
import os
import sys
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.logger import setup_logger
from sources.localdata import download_and_parse_pharmacy, download_and_parse_animal
from sources.mois_api import fetch_mois_records
from sources.hira_pharmacy import (
    fetch_all_hira_pharmacies,
    fetch_hira_opclo_events,
    opclo_events_as_hira_candidates,
)
from sources.nmc_pharmacy import fetch_all_nmc_pharmacies
from sources.hira_staff import parse_staff_xlsx
from transform.coordinate import convert_batch
from transform.matcher import (
    apply_hira_opclo_status,
    match_localdata_to_hira,
    match_to_animal,
    classify_herbal,
)
from transform.normalizer import normalize_name, extract_sido_sigungu
from load.supabase_loader import (
    get_client, upsert_pharmacies, upsert_staff,
    update_freshness, log_sync, detect_changes, upsert_mois_raw,
    upsert_hira_opclo_raw,
)
from load.cdn_json import generate_markers_json

log = setup_logger()

DEFAULT_STAFF_XLSX_PATH = "asset/12.의료기관별상세정보서비스_10_기타인력정보 2025.6.xlsx"


def _current_quarter_start(today: date) -> date:
    quarter_month = ((today.month - 1) // 3) * 3 + 1
    return date(today.year, quarter_month, 1)


def _parse_baseline_date(today: date) -> date:
    configured = os.environ.get("HIRA_BASELINE_DATE", "").strip()
    if configured:
        return datetime.strptime(configured, "%Y-%m-%d").date()
    return _current_quarter_start(today)


def _attach_operating_hours(pharmacies, nmc_data):
    nmc_by_name = {}
    for n in nmc_data:
        key = normalize_name(n["name"])
        nmc_by_name.setdefault(key, []).append(n)
    matched = 0
    for p in pharmacies:
        p_name = normalize_name(p["name"])
        candidates = nmc_by_name.get(p_name, [])
        for c in candidates:
            if (p.get("longitude") and c.get("longitude") and
                abs(p["longitude"] - c["longitude"]) < 0.002 and
                abs(p["latitude"] - c["latitude"]) < 0.002):
                for key in ("hours_mon", "hours_tue", "hours_wed", "hours_thu",
                           "hours_fri", "hours_sat", "hours_sun", "hours_hol"):
                    p[key] = c.get(key)
                p["nmc_id"] = c.get("hpid")
                matched += 1
                break
    log.info(f"Operating hours matched: {matched}/{len(pharmacies)}")


def _load_mois_or_localdata(api_key: str):
    raw_rows = []
    source_notes = []
    try:
        log.info("Step 1: Fetching MOIS pharmacy APIs...")
        pharmacies, pharmacy_raw = fetch_mois_records(
            api_key,
            source="pharmacy",
            filters={"cond[SALS_STTS_CD::EQ]": "01"},
        )
        log.info(f"  MOIS pharmacies (active): {len(pharmacies)}")
        animals, animal_raw = fetch_mois_records(
            api_key,
            source="animal_pharmacy",
            filters={"cond[SALS_STTS_CD::EQ]": "01"},
        )
        log.info(f"  MOIS animal pharmacies (active): {len(animals)}")
        raw_rows = pharmacy_raw + animal_raw
        source_notes.append("mois_api")
        return pharmacies, animals, raw_rows, source_notes
    except Exception as e:
        log.warning(f"  MOIS APIs failed, falling back to LOCALDATA ZIPs: {e}")
        source_notes.append(f"localdata_zip_fallback: {e}")

    log.info("Step 1 fallback: Downloading LOCALDATA CSVs...")
    pharmacies = download_and_parse_pharmacy()
    log.info(f"  Pharmacies (active): {len(pharmacies)}")
    animals = download_and_parse_animal()
    log.info(f"  Animal pharmacies (active): {len(animals)}")
    return pharmacies, animals, raw_rows, source_notes


def main():
    started_at = datetime.now(timezone.utc).isoformat()
    api_key = os.environ.get("DRUG_API_KEY", "")
    today_date = datetime.now(timezone.utc).date()
    today = today_date.strftime("%Y-%m-%d")
    hira_baseline_date = _parse_baseline_date(today_date)
    errors = []

    log.info("=== Daily Pharmacy Sync Started ===")

    localdata_pharmacies, localdata_animals, mois_raw_rows, source_notes = _load_mois_or_localdata(api_key)

    log.info("  Converting EPSG:5174 → WGS84...")
    convert_batch(localdata_pharmacies)
    convert_batch(localdata_animals)

    for p in localdata_pharmacies:
        sido, sigungu = extract_sido_sigungu(p.get("road_address") or p.get("address", ""))
        p["sido"] = sido
        p["sigungu"] = sigungu

    # Step 2: HIRA Pharmacy API
    log.info("Step 2: Fetching HIRA pharmacy API...")
    try:
        hira_pharmacies = fetch_all_hira_pharmacies(api_key)
        log.info(f"  HIRA pharmacies: {len(hira_pharmacies)}")
    except Exception as e:
        log.error(f"  HIRA API failed: {e}")
        hira_pharmacies = []
        errors.append(f"HIRA: {e}")

    log.info(f"Step 2b: Fetching HIRA open/close events since {hira_baseline_date.isoformat()}...")
    try:
        hira_opclo_events = fetch_hira_opclo_events(
            api_key,
            since=hira_baseline_date,
            until=today_date,
        )
        hira_opclo_candidates = opclo_events_as_hira_candidates(hira_opclo_events)
        hira_pharmacies_for_match = hira_pharmacies + hira_opclo_candidates
        open_events = sum(1 for e in hira_opclo_events if e.get("event_type") == "개업")
        closed_events = sum(1 for e in hira_opclo_events if e.get("event_type") == "폐업")
        suspended_events = sum(1 for e in hira_opclo_events if e.get("event_type") == "휴업")
        log.info(
            "  HIRA op/clo events: "
            f"{len(hira_opclo_events)} total, {open_events} opened, "
            f"{closed_events} closed, {suspended_events} suspended"
        )
    except Exception as e:
        log.warning(f"  HIRA open/close API failed (non-critical): {e}")
        hira_opclo_events = []
        hira_pharmacies_for_match = hira_pharmacies
        errors.append(f"HIRA op/clo: {e}")

    # Step 3: NMC API
    log.info("Step 3: Fetching 국립중앙의료원 API...")
    try:
        nmc_data = fetch_all_nmc_pharmacies(api_key)
        log.info(f"  NMC pharmacies: {len(nmc_data)}")
    except Exception as e:
        log.warning(f"  NMC API failed (non-critical): {e}")
        nmc_data = []
        errors.append(f"NMC: {e}")

    # Step 4: Match & merge
    log.info("Step 4: Matching sources...")
    matched, unmatched = match_localdata_to_hira(localdata_pharmacies, hira_pharmacies_for_match)
    log.info(f"  LOCALDATA↔HIRA matched: {len(matched)}, unmatched: {len(unmatched)}")

    all_pharmacies = matched + unmatched
    apply_hira_opclo_status(all_pharmacies, hira_opclo_events)

    all_pharmacies, unmatched_animals = match_to_animal(all_pharmacies, localdata_animals)
    animal_count = sum(1 for p in all_pharmacies if p.get("is_animal_pharmacy"))
    log.info(f"  Animal matched: {animal_count}, unmatched: {len(unmatched_animals)}")

    staff_path = os.environ.get("STAFF_XLSX_PATH", "")
    if not staff_path and os.path.exists(DEFAULT_STAFF_XLSX_PATH):
        staff_path = DEFAULT_STAFF_XLSX_PATH
    staff_data = {}
    if staff_path and os.path.exists(staff_path):
        log.info(f"  Loading staff from {staff_path}")
        staff_data = parse_staff_xlsx(staff_path)
    else:
        log.info("  Staff file not configured; herbal/cross flags will be empty")

    classify_herbal(all_pharmacies, staff_data)
    herbal_count = sum(1 for p in all_pharmacies if p.get("is_herbal_pharmacy"))
    cross_count = sum(1 for p in all_pharmacies if p.get("is_cross_employed"))
    log.info(f"  Herbal: {herbal_count}, Cross-employed: {cross_count}")

    if nmc_data:
        _attach_operating_hours(all_pharmacies, nmc_data)

    for p in all_pharmacies:
        p["source"] = "both" if p.get("has_ykiho") else "localdata"

    # Step 5: Detect changes + Upsert to Supabase
    log.info("Step 5: Upserting to Supabase...")
    change_stats = {"new_count": 0, "closed_count": 0, "changed_count": 0}
    try:
        client = get_client()

        if mois_raw_rows:
            log.info("  Upserting MOIS raw source rows...")
            raw_count = upsert_mois_raw(client, mois_raw_rows)
            log.info(f"  Upserted {raw_count} MOIS raw rows")

        if hira_opclo_events:
            log.info("  Upserting HIRA op/clo source rows...")
            opclo_count = upsert_hira_opclo_raw(client, hira_opclo_events)
            log.info(f"  Upserted {opclo_count} HIRA op/clo rows")

        # Detect changes before upsert
        log.info("  Detecting changes...")
        change_stats = detect_changes(client, all_pharmacies)
        log.info(f"  Changes: +{change_stats['new_count']} opened, -{change_stats['closed_count']} closed, ~{change_stats['changed_count']} changed")

        pharmacy_count = upsert_pharmacies(client, all_pharmacies)
        log.info(f"  Upserted {pharmacy_count} pharmacies")

        staff_count = 0
        if staff_data:
            staff_count = upsert_staff(client, staff_data, os.environ.get("STAFF_PERIOD", "unknown"))
            log.info(f"  Upserted {staff_count} staff records")

        update_freshness(client, "mois_pharmacy_api", today, len(localdata_pharmacies),
                         notes="; ".join(source_notes))
        update_freshness(client, "hira_pharmacy", today, len(hira_pharmacies))
        update_freshness(
            client,
            "hira_opclo",
            today,
            len(hira_opclo_events),
            notes=f"baseline_date={hira_baseline_date.isoformat()}",
        )
        if nmc_data:
            update_freshness(client, "nmc_hours", today, len(nmc_data))
        update_freshness(client, "mois_animal_pharmacy_api", today, len(localdata_animals),
                         notes="; ".join(source_notes))

        status = "partial" if errors else "success"
        log_sync(client, "daily", started_at, status,
                 pharmacy_count=pharmacy_count, animal_count=animal_count,
                 staff_count=staff_count, errors=errors if errors else None,
                 metadata={
                     "source_notes": source_notes,
                     "mois_raw_rows": len(mois_raw_rows),
                     "hira_opclo_rows": len(hira_opclo_events),
                     "hira_baseline_date": hira_baseline_date.isoformat(),
                 },
                 new_pharmacies=change_stats["new_count"],
                 closed_pharmacies=change_stats["closed_count"],
                 changed_pharmacies=change_stats["changed_count"])
    except Exception as e:
        log.error(f"  Supabase failed: {e}")
        errors.append(f"Supabase: {e}")
        status = "failed"

    # Step 6: CDN JSON
    log.info("Step 6: Generating markers.json...")
    output_path = os.environ.get("MARKERS_JSON_PATH", "/tmp/markers.json")
    generate_markers_json(all_pharmacies, output_path)
    log.info(f"  Written to {output_path}")

    log.info(f"=== Sync complete: {status} ({len(all_pharmacies)} pharmacies) ===")
    if errors:
        log.warning(f"  Errors: {errors}")

    return 0 if status != "failed" else 1


if __name__ == "__main__":
    sys.exit(main())
