#!/usr/bin/env python3
"""Backfill HIRA on-demand staff composition for post-CSV pharmacy openings."""
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from load.supabase_loader import (
    fetch_staff_lookup_candidates,
    get_client,
    update_freshness,
    upsert_staff_lookup_result,
)
from sources.hira_staff import fetch_staff_lookup
from utils.logger import setup_logger

log = setup_logger("staff_lookup_backfill")

DEFAULT_BASELINE_DATE = "2025-07-01"


def _date_env(name: str, default: str):
    return datetime.strptime(os.environ.get(name, default).strip(), "%Y-%m-%d").date()


def _int_env(name: str):
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else None


def _float_env(name: str, default: float):
    raw = os.environ.get(name, "").strip()
    return float(raw) if raw else default


def main() -> int:
    api_key = os.environ.get("DRUG_API_KEY", "")
    if not api_key:
        raise RuntimeError("DRUG_API_KEY is required")

    baseline_date = _date_env("STAFF_LOOKUP_BASELINE_DATE", DEFAULT_BASELINE_DATE)
    until_date = _date_env("STAFF_LOOKUP_UNTIL_DATE", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    limit = _int_env("STAFF_LOOKUP_LIMIT")
    delay = _float_env("STAFF_LOOKUP_DELAY_SECONDS", 0.15)

    client = get_client()
    candidates = fetch_staff_lookup_candidates(
        client,
        baseline_date=baseline_date,
        until_date=until_date,
        limit=limit,
    )
    log.info(
        "HIRA staff lookup candidates: "
        f"{len(candidates)} (baseline={baseline_date.isoformat()}, until={until_date.isoformat()}, "
        f"limit={limit or 'none'})"
    )

    looked_up = 0
    raw_rows = 0
    failed = 0
    for index, pharmacy in enumerate(candidates, start=1):
        try:
            rows, total_count = fetch_staff_lookup(api_key, pharmacy["ykiho"])
            raw_rows += upsert_staff_lookup_result(client, pharmacy, rows, total_count)
            looked_up += 1
            if index % 25 == 0 or index == len(candidates):
                log.info(f"HIRA staff lookup progress: {index}/{len(candidates)}")
            if delay:
                time.sleep(delay)
        except Exception as e:
            failed += 1
            log.warning(
                "HIRA staff lookup failed "
                f"for {pharmacy.get('name', '')} ({pharmacy.get('id', '')}): {e}"
            )

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    update_freshness(
        client,
        "hira_staff_lookup",
        today,
        looked_up,
        notes=f"baseline_date={baseline_date.isoformat()}; until_date={until_date.isoformat()}",
    )
    log.info(
        "HIRA staff lookup completed: "
        f"{looked_up} pharmacies, {raw_rows} raw rows, {failed} errors"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
