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
    stages = StageLog()

    stage = stages.start("fetch_candidates", "대상 약국 선정", limit=limit, refresh_days=refresh_days)
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
    stages.success(stage, count=len(candidates))

    stage = stages.start("lookup_staff", "HIRA 인력 API 순차 조회", delay_seconds=delay)
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
    if failed:
        stages.partial(stage, count=looked_up, error=f"{failed} failed", raw_rows=raw_rows, failed=failed)
    else:
        stages.success(stage, count=looked_up, raw_rows=raw_rows)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    notes = f"limit={limit}; refresh_days={refresh_days}; failed={failed}"
    stage = stages.start("write_logs", "신선도/운영 로그 저장")
    update_freshness(client, "hira_staff_lookup_batch", today, looked_up, notes=notes)
    stages.success(stage, count=looked_up)
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
            "stage_logs": stages.public_rows(),
            "github_run_url": _github_run_url(),
            "github_run_id": os.environ.get("GITHUB_RUN_ID"),
            "github_run_number": os.environ.get("GITHUB_RUN_NUMBER"),
        },
    )
    log.info(
        "HIRA staff lookup batch completed: "
        f"{looked_up} pharmacies, {raw_rows} raw rows, {failed} errors"
    )
    return 1 if fail_on_error and failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
