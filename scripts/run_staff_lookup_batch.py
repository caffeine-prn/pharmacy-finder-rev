#!/usr/bin/env python3
"""Run a capped rolling HIRA staff composition lookup batch."""
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from load.supabase_loader import (
    fetch_staff_lookup_due_candidates,
    get_client,
    log_sync,
    update_freshness,
    upsert_staff_lookup_result,
)
from sources.hira_staff import fetch_staff_lookup
from utils.logger import setup_logger

log = setup_logger("staff_lookup_batch")


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    return float(raw) if raw else default


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "y")


def main() -> int:
    started_at = datetime.now(timezone.utc).isoformat()
    api_key = os.environ.get("DRUG_API_KEY", "")
    if not api_key:
        raise RuntimeError("DRUG_API_KEY is required")

    limit = _int_env("STAFF_LOOKUP_LIMIT", 5000)
    refresh_days = _int_env("STAFF_LOOKUP_REFRESH_DAYS", 1)
    delay = _float_env("STAFF_LOOKUP_DELAY_SECONDS", 0.2)
    fail_on_error = _bool_env("STAFF_LOOKUP_FAIL_ON_ERROR", False)

    client = get_client()
    candidates = fetch_staff_lookup_due_candidates(
        client,
        limit=limit,
        refresh_days=refresh_days,
    )
    log.info(
        "HIRA staff lookup batch candidates: "
        f"{len(candidates)} (limit={limit}, refresh_days={refresh_days})"
    )

    looked_up = 0
    raw_rows = 0
    failed = 0
    errors = []
    for index, pharmacy in enumerate(candidates, start=1):
        try:
            rows, total_count = fetch_staff_lookup(api_key, pharmacy["ykiho"])
            raw_rows += upsert_staff_lookup_result(client, pharmacy, rows, total_count)
            looked_up += 1
            if index % 100 == 0 or index == len(candidates):
                log.info(f"HIRA staff lookup batch progress: {index}/{len(candidates)}")
            if delay:
                time.sleep(delay)
        except Exception as e:
            failed += 1
            message = (
                "HIRA staff lookup failed "
                f"for {pharmacy.get('name', '')} ({pharmacy.get('id', '')}): {e}"
            )
            errors.append(message)
            log.warning(message)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    notes = f"limit={limit}; refresh_days={refresh_days}; failed={failed}"
    update_freshness(client, "hira_staff_lookup_batch", today, looked_up, notes=notes)
    log_sync(
        client,
        "hira_staff_lookup_batch",
        started_at,
        "partial" if failed else "success",
        staff_count=raw_rows,
        errors=errors[:100] if errors else None,
        metadata={
            "candidate_count": len(candidates),
            "looked_up": looked_up,
            "raw_rows": raw_rows,
            "failed": failed,
            "limit": limit,
            "refresh_days": refresh_days,
            "delay_seconds": delay,
        },
    )
    log.info(
        "HIRA staff lookup batch completed: "
        f"{looked_up} pharmacies, {raw_rows} raw rows, {failed} errors"
    )
    return 1 if fail_on_error and failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
