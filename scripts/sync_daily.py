#!/usr/bin/env python3
"""Daily pharmacy data sync orchestrator."""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.logger import setup_logger
from sources.localdata import download_and_parse_pharmacy, download_and_parse_animal
from sources.hira_pharmacy import fetch_all_hira_pharmacies
from sources.nmc_pharmacy import fetch_all_nmc_pharmacies
from sources.hira_staff import parse_staff_xlsx
from transform.coordinate import convert_batch
from transform.matcher import match_localdata_to_hira, match_to_animal, classify_herbal
from transform.normalizer import normalize_name, extract_sido_sigungu
from load.supabase_loader import (
    get_client, upsert_pharmacies, upsert_staff,
    update_freshness, log_sync, detect_changes
)
from load.cdn_json import generate_markers_json

log = setup_logger()


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


def main():
    started_at = datetime.now(timezone.utc).isoformat()
    api_key = os.environ.get("DRUG_API_KEY", "")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    errors = []

    log.info("=== Daily Pharmacy Sync Started ===")

    # Step 1: LOCALDATA
    log.info("Step 1: Downloading LOCALDATA CSVs...")
    localdata_pharmacies = download_and_parse_pharmacy()
    log.info(f"  Pharmacies (active): {len(localdata_pharmacies)}")
    localdata_animals = download_and_parse_animal()
    log.info(f"  Animal pharmacies (active): {len(localdata_animals)}")

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
    matched, unmatched = match_localdata_to_hira(localdata_pharmacies, hira_pharmacies)
    log.info(f"  LOCALDATA↔HIRA matched: {len(matched)}, unmatched: {len(unmatched)}")

    all_pharmacies = matched + unmatched

    all_pharmacies, unmatched_animals = match_to_animal(all_pharmacies, localdata_animals)
    animal_count = sum(1 for p in all_pharmacies if p.get("is_animal_pharmacy"))
    log.info(f"  Animal matched: {animal_count}, unmatched: {len(unmatched_animals)}")

    staff_path = os.environ.get("STAFF_XLSX_PATH", "")
    staff_data = {}
    if staff_path and os.path.exists(staff_path):
        log.info(f"  Loading staff from {staff_path}")
        staff_data = parse_staff_xlsx(staff_path)

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

        update_freshness(client, "localdata", today, len(localdata_pharmacies))
        update_freshness(client, "hira_pharmacy", today, len(hira_pharmacies))
        if nmc_data:
            update_freshness(client, "nmc_hours", today, len(nmc_data))
        update_freshness(client, "animal_pharmacy", today, len(localdata_animals))

        status = "partial" if errors else "success"
        log_sync(client, "daily", started_at, status,
                 pharmacy_count=pharmacy_count, animal_count=animal_count,
                 staff_count=staff_count, errors=errors if errors else None,
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
