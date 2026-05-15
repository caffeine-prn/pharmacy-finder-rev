#!/usr/bin/env python3
"""Daily pharmacy data sync orchestrator."""
import os
import sys
import time
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
from sources.hira_staff import fetch_staff_lookup, parse_staff_xlsx, sum_staff_count
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
    upsert_hira_opclo_raw, fetch_staff_lookup_candidates,
    fetch_staff_lookup_updates, upsert_staff_lookup_result,
)
from load.cdn_json import generate_markers_json

log = setup_logger()

DEFAULT_STAFF_XLSX_PATH = "asset/12.의료기관별상세정보서비스_10_기타인력정보 2025.6.xlsx"
DEFAULT_STAFF_LOOKUP_BASELINE_DATE = "2025-07-01"


class StageLog:
    def __init__(self):
        self.rows = []

    def start(self, key: str, label: str, **metadata):
        row = {
            "key": key,
            "label": label,
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "_started_perf": time.perf_counter(),
        }
        if metadata:
            row["metadata"] = metadata
        self.rows.append(row)
        return row

    def success(self, row: dict, count: int | None = None, **metadata):
        self._finish(row, "success", count=count, metadata=metadata)

    def partial(self, row: dict, count: int | None = None, error: str | None = None, **metadata):
        self._finish(row, "partial", count=count, error=error, metadata=metadata)

    def failed(self, row: dict, error: Exception | str, count: int | None = None, **metadata):
        self._finish(row, "failed", count=count, error=str(error), metadata=metadata)

    def _finish(
        self,
        row: dict,
        status: str,
        count: int | None = None,
        error: str | None = None,
        metadata: dict | None = None,
    ):
        row["status"] = status
        row["completed_at"] = datetime.now(timezone.utc).isoformat()
        started_perf = row.pop("_started_perf", None)
        if started_perf is not None:
            row["duration_ms"] = int((time.perf_counter() - started_perf) * 1000)
        if count is not None:
            row["count"] = count
        if error:
            row["error"] = error
        if metadata:
            row.setdefault("metadata", {}).update(metadata)

    def public_rows(self):
        return [{k: v for k, v in row.items() if not k.startswith("_")} for row in self.rows]


def _github_run_url() -> str | None:
    server = os.environ.get("GITHUB_SERVER_URL", "").rstrip("/")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    if server and repo and run_id:
        return f"{server}/{repo}/actions/runs/{run_id}"
    return None


def _current_quarter_start(today: date) -> date:
    quarter_month = ((today.month - 1) // 3) * 3 + 1
    return date(today.year, quarter_month, 1)


def _parse_baseline_date(today: date) -> date:
    configured = os.environ.get("HIRA_BASELINE_DATE", "").strip()
    if configured:
        return datetime.strptime(configured, "%Y-%m-%d").date()
    return _current_quarter_start(today)


def _parse_date_env(name: str, default: str) -> date:
    return datetime.strptime(os.environ.get(name, default).strip(), "%Y-%m-%d").date()


def _parse_int_env(name: str, default: int | None = None) -> int | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    return int(raw)


def _parse_float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    return float(raw) if raw else default


def _parse_bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw not in ("0", "false", "no", "off")


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


def _run_initial_staff_lookup(client, api_key: str, today_date: date, all_pharmacies: list[dict]) -> dict:
    if os.environ.get("STAFF_LOOKUP_ENABLED", "true").lower() in ("0", "false", "no"):
        log.info("  HIRA staff lookup backfill disabled")
        return {"candidates": 0, "looked_up": 0, "rows": 0, "errors": 0, "updates": {}}
    if not api_key:
        log.info("  HIRA staff lookup skipped: DRUG_API_KEY is not configured")
        return {"candidates": 0, "looked_up": 0, "rows": 0, "errors": 0, "updates": {}}

    baseline_date = _parse_date_env("STAFF_LOOKUP_BASELINE_DATE", DEFAULT_STAFF_LOOKUP_BASELINE_DATE)
    limit = _parse_int_env("STAFF_LOOKUP_LIMIT")
    delay = _parse_float_env("STAFF_LOOKUP_DELAY_SECONDS", 0.15)

    candidates = fetch_staff_lookup_candidates(
        client,
        baseline_date=baseline_date,
        until_date=today_date,
        limit=limit,
    )
    log.info(
        "  HIRA staff lookup candidates: "
        f"{len(candidates)} (baseline={baseline_date.isoformat()}, limit={limit or 'none'})"
    )

    looked_up = 0
    raw_rows = 0
    failed = 0
    updates_by_ykiho = {}
    for index, pharmacy in enumerate(candidates, start=1):
        try:
            rows, total_count = fetch_staff_lookup(api_key, pharmacy["ykiho"])
            row_count = upsert_staff_lookup_result(client, pharmacy, rows, total_count)
            pharmacist_count = sum_staff_count(rows, "071", "약사")
            herbal_pharmacist_count = sum_staff_count(rows, "072", "한약사")
            updates_by_ykiho[pharmacy["ykiho"]] = {
                "pharmacist_count": pharmacist_count,
                "herbal_pharmacist_count": herbal_pharmacist_count,
                "is_herbal_pharmacy": herbal_pharmacist_count > 0,
                "is_cross_employed": pharmacist_count > 0 and herbal_pharmacist_count > 0,
            }
            looked_up += 1
            raw_rows += row_count
            if index % 25 == 0 or index == len(candidates):
                log.info(f"  HIRA staff lookup progress: {index}/{len(candidates)}")
            if delay:
                time.sleep(delay)
        except Exception as e:
            failed += 1
            log.warning(
                "  HIRA staff lookup failed "
                f"for {pharmacy.get('name', '')} ({pharmacy.get('id', '')}): {e}"
            )

    if updates_by_ykiho:
        for pharmacy in all_pharmacies:
            update = updates_by_ykiho.get(pharmacy.get("ykiho"))
            if update:
                pharmacy.update(update)

    log.info(
        "  HIRA staff lookup completed: "
        f"{looked_up} pharmacies, {raw_rows} raw rows, {failed} errors"
    )
    return {
        "candidates": len(candidates),
        "looked_up": looked_up,
        "rows": raw_rows,
        "errors": failed,
        "updates": updates_by_ykiho,
        "baseline_date": baseline_date.isoformat(),
    }


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
    stages = StageLog()
    client = None
    pharmacy_count = 0
    staff_count = 0
    sync_metadata = {}

    log.info("=== Daily Pharmacy Sync Started ===")

    stage = stages.start("mois_source", "행안부 약국/동물약국 수집")
    localdata_pharmacies, localdata_animals, mois_raw_rows, source_notes = _load_mois_or_localdata(api_key)
    stages.success(
        stage,
        count=len(localdata_pharmacies),
        animal_count=len(localdata_animals),
        raw_rows=len(mois_raw_rows),
        source_notes=source_notes,
    )

    stage = stages.start("coordinates", "좌표 변환/지역 추출")
    log.info("  Converting EPSG:5174 → WGS84...")
    convert_batch(localdata_pharmacies)
    convert_batch(localdata_animals)

    for p in localdata_pharmacies:
        sido, sigungu = extract_sido_sigungu(p.get("road_address") or p.get("address", ""))
        p["sido"] = sido
        p["sigungu"] = sigungu
    stages.success(stage, count=len(localdata_pharmacies) + len(localdata_animals))

    # Step 2: HIRA Pharmacy API
    log.info("Step 2: Fetching HIRA pharmacy API...")
    stage = stages.start("hira_pharmacy", "HIRA 약국 기본목록 수집")
    try:
        hira_pharmacies = fetch_all_hira_pharmacies(api_key)
        log.info(f"  HIRA pharmacies: {len(hira_pharmacies)}")
        stages.success(stage, count=len(hira_pharmacies))
    except Exception as e:
        log.error(f"  HIRA API failed: {e}")
        hira_pharmacies = []
        errors.append(f"HIRA: {e}")
        stages.failed(stage, e)

    log.info(f"Step 2b: Fetching HIRA open/close events since {hira_baseline_date.isoformat()}...")
    stage = stages.start("hira_opclo", "HIRA 개폐업 이벤트 수집", baseline_date=hira_baseline_date.isoformat())
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
        stages.success(
            stage,
            count=len(hira_opclo_events),
            opened=open_events,
            closed=closed_events,
            suspended=suspended_events,
        )
    except Exception as e:
        log.warning(f"  HIRA open/close API failed (non-critical): {e}")
        hira_opclo_events = []
        hira_pharmacies_for_match = hira_pharmacies
        errors.append(f"HIRA op/clo: {e}")
        stages.failed(stage, e)

    # Step 3: NMC API
    log.info("Step 3: Fetching 국립중앙의료원 API...")
    stage = stages.start("nmc_hours", "공공 심야/휴일 약국 수집")
    try:
        nmc_data = fetch_all_nmc_pharmacies(api_key)
        log.info(f"  NMC pharmacies: {len(nmc_data)}")
        stages.success(stage, count=len(nmc_data))
    except Exception as e:
        log.warning(f"  NMC API failed (non-critical): {e}")
        nmc_data = []
        errors.append(f"NMC: {e}")
        stages.failed(stage, e)

    # Step 4: Match & merge
    log.info("Step 4: Matching sources...")
    stage = stages.start("match_sources", "데이터 소스 매칭/분류")
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
    stages.success(
        stage,
        count=len(all_pharmacies),
        matched_hira=len(matched),
        unmatched_hira=len(unmatched),
        animal_count=animal_count,
        unmatched_animals=len(unmatched_animals),
        herbal_count=herbal_count,
        cross_count=cross_count,
    )

    # Step 5: Detect changes + Upsert to Supabase
    log.info("Step 5: Upserting to Supabase...")
    change_stats = {"new_count": 0, "closed_count": 0, "changed_count": 0}
    staff_lookup_stats = {"candidates": 0, "looked_up": 0, "rows": 0, "errors": 0}
    try:
        stage = stages.start("supabase_connect", "Supabase 연결")
        client = get_client()
        stages.success(stage)

        if mois_raw_rows:
            stage = stages.start("upsert_mois_raw", "행안부 원천행 저장")
            log.info("  Upserting MOIS raw source rows...")
            raw_count = upsert_mois_raw(client, mois_raw_rows)
            log.info(f"  Upserted {raw_count} MOIS raw rows")
            stages.success(stage, count=raw_count)

        if hira_opclo_events:
            stage = stages.start("upsert_hira_opclo", "HIRA 개폐업 원천행 저장")
            log.info("  Upserting HIRA op/clo source rows...")
            opclo_count = upsert_hira_opclo_raw(client, hira_opclo_events)
            log.info(f"  Upserted {opclo_count} HIRA op/clo rows")
            stages.success(stage, count=opclo_count)

        # Detect changes before upsert
        stage = stages.start("detect_changes", "신규/폐업/변경 감지")
        log.info("  Detecting changes...")
        change_stats = detect_changes(client, all_pharmacies)
        log.info(f"  Changes: +{change_stats['new_count']} opened, -{change_stats['closed_count']} closed, ~{change_stats['changed_count']} changed")
        stages.success(
            stage,
            count=sum(change_stats.values()),
            new_count=change_stats["new_count"],
            closed_count=change_stats["closed_count"],
            changed_count=change_stats["changed_count"],
        )

        stage = stages.start("upsert_pharmacies", "정규화 약국 테이블 저장")
        pharmacy_count = upsert_pharmacies(client, all_pharmacies)
        log.info(f"  Upserted {pharmacy_count} pharmacies")
        stages.success(stage, count=pharmacy_count)

        staff_lookup_updates = {}
        staff_count = 0
        if staff_data and _parse_bool_env("STAFF_XLSX_UPSERT_ENABLED", True):
            stage = stages.start("upsert_staff_xlsx", "HIRA 분기 XLSX 인력 저장")
            skip_ykihos = set()
            if _parse_bool_env("STAFF_XLSX_SKIP_API_REFRESHED", True):
                staff_lookup_updates = fetch_staff_lookup_updates(client)
                skip_ykihos = set(staff_lookup_updates.keys())
                log.info(
                    "  Skipping XLSX staff upsert for "
                    f"{len(skip_ykihos)} pharmacies with HIRA API staff lookup"
                )
            staff_count = upsert_staff(
                client,
                staff_data,
                os.environ.get("STAFF_PERIOD", "unknown"),
                skip_ykihos=skip_ykihos,
            )
            log.info(f"  Upserted {staff_count} staff records from XLSX")
            stages.success(stage, count=staff_count, skipped_api_refreshed=len(skip_ykihos))
        elif staff_data:
            log.info("  Staff XLSX upsert disabled; keeping existing pharmacy_staff rows")
            stage = stages.start("upsert_staff_xlsx", "HIRA 분기 XLSX 인력 저장")
            stages.success(stage, count=0, disabled=True)

        stage = stages.start("initial_staff_lookup", "신규 개업 약국 HIRA 인력 최초 조회")
        log.info("  Running initial HIRA staff lookup for post-CSV openings...")
        staff_lookup_stats = _run_initial_staff_lookup(client, api_key, today_date, all_pharmacies)
        if staff_lookup_stats.get("errors"):
            errors.append(f"HIRA staff lookup: {staff_lookup_stats['errors']} failed")
            stages.partial(
                stage,
                count=staff_lookup_stats.get("looked_up", 0),
                error=f"{staff_lookup_stats['errors']} failed",
                candidates=staff_lookup_stats.get("candidates", 0),
                raw_rows=staff_lookup_stats.get("rows", 0),
            )
        else:
            stages.success(
                stage,
                count=staff_lookup_stats.get("looked_up", 0),
                candidates=staff_lookup_stats.get("candidates", 0),
                raw_rows=staff_lookup_stats.get("rows", 0),
            )

        stage = stages.start("apply_staff_summaries", "최신 인력 요약 재적용")
        staff_lookup_updates = fetch_staff_lookup_updates(client)
        if staff_lookup_updates:
            for pharmacy in all_pharmacies:
                update = staff_lookup_updates.get(pharmacy.get("ykiho"))
                if update:
                    pharmacy.update({
                        "pharmacist_count": update.get("pharmacist_count") or 0,
                        "herbal_pharmacist_count": update.get("herbal_pharmacist_count") or 0,
                        "is_herbal_pharmacy": update.get("is_herbal_pharmacy") or False,
                        "is_cross_employed": update.get("is_cross_employed") or False,
                        "hira_staff_fetched_at": update.get("hira_staff_fetched_at"),
                        "hira_staff_total_count": update.get("hira_staff_total_count"),
                    })
            log.info(f"  Applied {len(staff_lookup_updates)} on-demand staff summaries")
        stages.success(stage, count=len(staff_lookup_updates))

        stage = stages.start("update_freshness", "데이터 소스 신선도 기록")
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
        update_freshness(
            client,
            "hira_staff_lookup",
            today,
            staff_lookup_stats.get("looked_up", 0),
            notes=f"baseline_date={staff_lookup_stats.get('baseline_date', DEFAULT_STAFF_LOOKUP_BASELINE_DATE)}",
        )
        stages.success(stage, count=6 if nmc_data else 5)

        status = "partial" if errors else "success"
        sync_metadata = {
            "source_notes": source_notes,
            "mois_raw_rows": len(mois_raw_rows),
            "hira_opclo_rows": len(hira_opclo_events),
            "hira_baseline_date": hira_baseline_date.isoformat(),
            "hira_staff_lookup_candidates": staff_lookup_stats.get("candidates", 0),
            "hira_staff_lookup_count": staff_lookup_stats.get("looked_up", 0),
            "hira_staff_lookup_rows": staff_lookup_stats.get("rows", 0),
            "github_run_url": _github_run_url(),
            "github_run_id": os.environ.get("GITHUB_RUN_ID"),
            "github_run_number": os.environ.get("GITHUB_RUN_NUMBER"),
        }
    except Exception as e:
        log.error(f"  Supabase failed: {e}")
        errors.append(f"Supabase: {e}")
        status = "failed"
        if "stage" in locals() and stage.get("status") == "running":
            stages.failed(stage, e)

    # Step 6: CDN JSON
    log.info("Step 6: Generating markers.json...")
    stage = stages.start("generate_markers", "배포용 markers.json 생성")
    output_path = os.environ.get("MARKERS_JSON_PATH", "/tmp/markers.json")
    generate_markers_json(all_pharmacies, output_path)
    log.info(f"  Written to {output_path}")
    stages.success(stage, count=len(all_pharmacies), output_path=output_path)

    if client:
        sync_metadata["stage_logs"] = stages.public_rows()
        log_sync(client, "daily", started_at, status,
                 pharmacy_count=pharmacy_count, animal_count=animal_count,
                 staff_count=staff_count, errors=errors if errors else None,
                 metadata=sync_metadata,
                 new_pharmacies=change_stats["new_count"],
                 closed_pharmacies=change_stats["closed_count"],
                 changed_pharmacies=change_stats["changed_count"])

    log.info(f"=== Sync complete: {status} ({len(all_pharmacies)} pharmacies) ===")
    if errors:
        log.warning(f"  Errors: {errors}")

    return 0 if status != "failed" else 1


if __name__ == "__main__":
    sys.exit(main())
