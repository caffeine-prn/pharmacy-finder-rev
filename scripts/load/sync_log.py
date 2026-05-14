import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


def _read_json(path: Path, fallback: dict) -> dict:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return fallback


def _first_int(pattern: str, text: str) -> int | None:
    match = re.search(pattern, text)
    return int(match.group(1)) if match else None


def _parse_log(log_text: str) -> dict:
    changes = re.search(
        r"Changes:\s+\+(\d+) opened,\s+-(\d+) closed,\s+~(\d+) changed", log_text
    )
    matched = re.search(
        r"LOCALDATA↔HIRA matched:\s+(\d+), unmatched:\s+(\d+)", log_text
    )
    animal = re.search(r"Animal matched:\s+(\d+), unmatched:\s+(\d+)", log_text)

    return {
        "localdata_pharmacies": _first_int(r"Pharmacies \(active\):\s+(\d+)", log_text),
        "localdata_animal_pharmacies": _first_int(
            r"Animal pharmacies \(active\):\s+(\d+)", log_text
        ),
        "hira_pharmacies": _first_int(r"HIRA pharmacies:\s+(\d+)", log_text),
        "nmc_pharmacies": _first_int(r"NMC pharmacies:\s+(\d+)", log_text),
        "matched_hira": int(matched.group(1)) if matched else None,
        "unmatched_hira": int(matched.group(2)) if matched else None,
        "matched_animal": int(animal.group(1)) if animal else None,
        "unmatched_animal": int(animal.group(2)) if animal else None,
        "new_pharmacies": int(changes.group(1)) if changes else None,
        "closed_pharmacies": int(changes.group(2)) if changes else None,
        "changed_pharmacies": int(changes.group(3)) if changes else None,
    }


def _extract_errors(log_text: str) -> list[str]:
    errors = []
    for line in log_text.splitlines():
        if "[ERROR]" in line or "[WARNING]" in line:
            errors.append(line.strip())
    return errors[-10:]


def main() -> int:
    log_path = Path(os.environ.get("SYNC_LOG_RAW_PATH", "/tmp/sync-daily.log"))
    output_path = Path(os.environ.get("SYNC_LOG_JSON_PATH", "frontend/public/sync-log.json"))
    markers_path = Path(os.environ.get("MARKERS_JSON_PATH", "frontend/public/markers.json"))
    exit_code = int(os.environ.get("SYNC_EXIT_CODE") or "1")

    now = datetime.now(timezone.utc).isoformat()
    raw_log = log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else ""
    previous = _read_json(output_path, {"version": 1, "events": []})
    markers = _read_json(markers_path, {})
    parsed = _parse_log(raw_log)

    status = "success" if exit_code == 0 else "failed"
    github_repository = os.environ.get("GITHUB_REPOSITORY", "")
    github_run_id = os.environ.get("GITHUB_RUN_ID", "")
    run_url = (
        f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/"
        f"{github_repository}/actions/runs/{github_run_id}"
        if github_repository and github_run_id
        else ""
    )

    event = {
        "id": github_run_id or now,
        "status": status,
        "started_at": _match_text(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[INFO\] === Daily Pharmacy Sync Started ===", raw_log),
        "finished_at": now,
        "github_run_id": github_run_id,
        "github_run_number": os.environ.get("GITHUB_RUN_NUMBER", ""),
        "github_sha": os.environ.get("GITHUB_SHA", ""),
        "github_ref": os.environ.get("GITHUB_REF_NAME", ""),
        "github_actor": os.environ.get("GITHUB_ACTOR", ""),
        "github_run_url": run_url,
        "exit_code": exit_code,
        "markers_generated_at": markers.get("generated_at"),
        "marker_count": markers.get("count"),
        "source_counts": parsed,
        "errors": _extract_errors(raw_log),
    }

    events = [event]
    for item in previous.get("events", []):
        if item.get("id") != event["id"]:
            events.append(item)

    output = {
        "version": 1,
        "updated_at": now,
        "latest": event,
        "events": events[:30],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


def _match_text(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text)
    return match.group(1) if match else None


if __name__ == "__main__":
    raise SystemExit(main())
