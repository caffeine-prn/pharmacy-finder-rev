#!/usr/bin/env python3
"""Audit active LOCALDATA pharmacies that are missing a HIRA ykiho.

This is intentionally conservative: it only applies matches that pass the
same LOCALDATA-to-HIRA matcher used by the daily sync pipeline.
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from load.cdn_json import generate_markers_json
from sources.hira_pharmacy import fetch_all_hira_pharmacies
from transform.matcher import match_localdata_to_hira
from transform.normalizer import normalize_name

PHARMACY_BASE_URL = "https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList"


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        value = value.strip().strip('"').strip("'")
        # Some locally captured env files contain literal "\nKEY=value" tails.
        if "\\n" in value:
            value = value.split("\\n", 1)[0]
        os.environ.setdefault(key, value)


def _env(name: str, *fallbacks: str) -> str:
    for key in (name, *fallbacks):
        value = os.environ.get(key)
        if value:
            return value
    raise RuntimeError(f"Missing required environment variable: {name}")


def _db_headers() -> dict[str, str]:
    key = _env("SUPABASE_SERVICE_KEY")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _db_url(path: str, query: str = "") -> str:
    base = _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    return f"{base}/rest/v1/{path}{'?' + query if query else ''}"


def _db_get(path: str, params: dict[str, str], headers: dict[str, str] | None = None):
    query = urllib.parse.urlencode(params, safe=",.*()")
    req = urllib.request.Request(_db_url(path, query), headers={**_db_headers(), **(headers or {})})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8")), resp.headers


def _db_patch(path: str, params: dict[str, str], payload: dict):
    query = urllib.parse.urlencode(params, safe=",.*()")
    req = urllib.request.Request(
        _db_url(path, query),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={**_db_headers(), "Prefer": "return=representation"},
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _db_fetch_all(path: str, params: dict[str, str], page_size: int = 1000) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        batch, _ = _db_get(
            path,
            params,
            {"Range": f"{offset}-{offset + page_size - 1}"},
        )
        rows.extend(batch)
        if len(batch) < page_size:
            return rows
        offset += page_size


def _parse_hira_items(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    result_code = root.findtext(".//resultCode", "")
    if result_code != "00":
        raise RuntimeError(f"HIRA API error: {root.findtext('.//resultMsg', 'unknown')}")
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
    return items


def _hira_search(api_key: str, name: str, page_size: int = 100) -> list[dict]:
    query = urllib.parse.urlencode({
        "ServiceKey": api_key,
        "pageNo": "1",
        "numOfRows": str(page_size),
        "yadmNm": name,
    })
    req = urllib.request.Request(
        f"{PHARMACY_BASE_URL}?{query}",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return _parse_hira_items(resp.read().decode("utf-8"))


def _search_terms(name: str) -> list[str]:
    terms = [name.strip()]
    normalized = normalize_name(name)
    if normalized and normalized not in terms:
        terms.append(normalized)
    compact = name.replace(" ", "").strip()
    if compact and compact not in terms:
        terms.append(compact)
    return terms[:3]


def _iso_date(value: str | None) -> str | None:
    if not value:
        return None
    value = str(value).strip()
    if len(value) == 8 and value.isdigit():
        return f"{value[:4]}-{value[4:6]}-{value[6:]}"
    return value[:10]


def _patch_payload(local: dict, matched: dict) -> dict:
    payload = {
        "ykiho": matched["ykiho"],
        "has_ykiho": True,
        "hira_open_date": _iso_date(matched.get("hira_open_date")),
        "source": "both",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if matched.get("longitude") is not None and matched.get("latitude") is not None:
        payload["longitude"] = matched["longitude"]
        payload["latitude"] = matched["latitude"]
        payload["location"] = f"POINT({matched['longitude']} {matched['latitude']})"
    if not local.get("phone") and matched.get("phone"):
        payload["phone"] = matched["phone"]
    return payload


def _active_missing_ykiho(limit: int | None) -> list[dict]:
    rows = _db_fetch_all(
        "pharmacies",
        {
            "select": (
                "id,name,ykiho,has_ykiho,sido,sigungu,address,road_address,phone,"
                "open_date,mois_license_date,mois_closed_date,business_status,"
                "business_status_code,longitude,latitude"
            ),
            "has_ykiho": "eq.false",
            "business_status_code": "eq.01",
            "order": "mois_license_date.desc.nullslast,name.asc",
        },
    )
    rows = [row for row in rows if not row.get("mois_closed_date")]
    return rows[:limit] if limit else rows


def _existing_ykihos(ykihos: set[str]) -> dict[str, dict]:
    existing = {}
    for ykiho in sorted(ykihos):
        rows, _ = _db_get("pharmacies", {"select": "id,name,ykiho", "ykiho": f"eq.{ykiho}"})
        if rows:
            existing[ykiho] = rows[0]
    return existing


def _refresh_markers(output_path: Path) -> int:
    rows = _db_fetch_all(
        "pharmacies",
        {
            "select": (
                "id,name,longitude,latitude,is_herbal_pharmacy,is_animal_pharmacy,"
                "is_cross_employed,has_ykiho,sido,sigungu,phone,mois_license_date,"
                "hira_open_date,open_date,mois_closed_date,business_status"
            ),
            "order": "name.asc",
        },
    )
    generate_markers_json(rows, str(output_path))
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Patch strong matches into Supabase")
    parser.add_argument("--limit", type=int, default=None, help="Limit pharmacies audited")
    parser.add_argument("--delay", type=float, default=0.2, help="Delay between HIRA requests")
    parser.add_argument(
        "--mode",
        choices=("all-hira", "name-search"),
        default="all-hira",
        help="Use one full HIRA basis download, or per-pharmacy name search",
    )
    parser.add_argument("--refresh-markers", action="store_true", help="Regenerate frontend/public/markers.json after applying")
    parser.add_argument("--json", default="", help="Write audit result JSON to this path")
    args = parser.parse_args()

    _load_env_file(ROOT / "frontend/.env.production.local")
    api_key = _env("DRUG_API_KEY")

    pharmacies = _active_missing_ykiho(args.limit)
    results = []
    strong = []
    errors = []

    print(f"Auditing active pharmacies without ykiho: {len(pharmacies)}", flush=True)
    if args.mode == "all-hira":
        hira_items = fetch_all_hira_pharmacies(api_key, page_size=1000, delay=args.delay, max_workers=4)
        hira_by_ykiho = {item["ykiho"]: item for item in hira_items if item.get("ykiho")}
        matched_rows, unmatched_rows = match_localdata_to_hira(pharmacies, hira_items)
        for row in matched_rows:
            hira_match = hira_by_ykiho.get(row.get("ykiho"))
            if hira_match and not row.get("phone") and hira_match.get("phone"):
                row["phone"] = hira_match["phone"]
        matched_by_id = {row["id"]: row for row in matched_rows}
        for index, pharmacy in enumerate(pharmacies, 1):
            match = matched_by_id.get(pharmacy["id"])
            results.append({
                "id": pharmacy["id"],
                "name": pharmacy["name"],
                "address": pharmacy.get("road_address") or pharmacy.get("address"),
                "candidate_count": None,
                "matched": bool(match),
                "match": match,
            })
            if match:
                strong.append((pharmacy, match))
                print(f"  [{index}/{len(pharmacies)}] MATCH {pharmacy['name']} -> {match['ykiho']}", flush=True)
            else:
                print(f"  [{index}/{len(pharmacies)}] no match {pharmacy['name']}", flush=True)
        if unmatched_rows:
            print(f"Unmatched after full HIRA audit: {len(unmatched_rows)}", flush=True)
    else:
        for index, pharmacy in enumerate(pharmacies, 1):
            candidates_by_ykiho = {}
            try:
                for term in _search_terms(pharmacy["name"]):
                    for candidate in _hira_search(api_key, term):
                        if candidate.get("ykiho"):
                            candidates_by_ykiho[candidate["ykiho"]] = candidate
                    if candidates_by_ykiho:
                        break
                    if args.delay:
                        time.sleep(args.delay)
                matched, _ = match_localdata_to_hira([pharmacy], list(candidates_by_ykiho.values()))
                item = {
                    "id": pharmacy["id"],
                    "name": pharmacy["name"],
                    "address": pharmacy.get("road_address") or pharmacy.get("address"),
                    "candidate_count": len(candidates_by_ykiho),
                    "matched": bool(matched),
                    "match": matched[0] if matched else None,
                }
                results.append(item)
                if matched:
                    strong.append((pharmacy, matched[0]))
                    print(f"  [{index}/{len(pharmacies)}] MATCH {pharmacy['name']} -> {matched[0]['ykiho']}", flush=True)
                else:
                    print(f"  [{index}/{len(pharmacies)}] no match {pharmacy['name']} candidates={len(candidates_by_ykiho)}", flush=True)
            except Exception as exc:
                error = {"id": pharmacy.get("id"), "name": pharmacy.get("name"), "error": str(exc)}
                errors.append(error)
                print(f"  [{index}/{len(pharmacies)}] ERROR {pharmacy.get('name')}: {exc}", flush=True)
            if args.delay:
                time.sleep(args.delay)

    applied = []
    skipped_conflicts = []
    if args.apply and strong:
        strong_counts: dict[str, int] = {}
        for _, match in strong:
            strong_counts[match["ykiho"]] = strong_counts.get(match["ykiho"], 0) + 1
        existing = _existing_ykihos({match["ykiho"] for _, match in strong})
        for local, match in strong:
            if strong_counts.get(match["ykiho"], 0) > 1:
                skipped_conflicts.append({
                    "id": local["id"],
                    "name": local["name"],
                    "ykiho": match["ykiho"],
                    "reason": "duplicate_strong_candidates",
                })
                print(f"  SKIP duplicate candidates {local['name']} -> {match['ykiho']}", flush=True)
                continue
            conflict = existing.get(match["ykiho"])
            if conflict and conflict.get("id") != local["id"]:
                skipped_conflicts.append({
                    "id": local["id"],
                    "name": local["name"],
                    "ykiho": match["ykiho"],
                    "reason": "ykiho_already_used",
                    "existing": conflict,
                })
                print(f"  SKIP conflict {local['name']} -> {match['ykiho']} already used by {conflict.get('name')}", flush=True)
                continue
            try:
                patched = _db_patch("pharmacies", {"id": f"eq.{local['id']}"}, _patch_payload(local, match))
                applied.extend(patched)
                print(f"  APPLIED {local['name']} -> {match['ykiho']}", flush=True)
            except Exception as exc:
                errors.append({"id": local["id"], "name": local["name"], "ykiho": match["ykiho"], "error": str(exc)})
                print(f"  ERROR apply {local['name']} -> {match['ykiho']}: {exc}", flush=True)

    marker_rows = None
    if args.apply and args.refresh_markers:
        marker_rows = _refresh_markers(ROOT / "frontend/public/markers.json")
        print(f"Regenerated markers from {marker_rows} pharmacy rows", flush=True)

    summary = {
        "audited": len(pharmacies),
        "strong_matches": len(strong),
        "applied": len(applied),
        "skipped_conflicts": len(skipped_conflicts),
        "errors": len(errors),
        "marker_source_rows": marker_rows,
        "results": results,
        "applied_rows": applied,
        "conflicts": skipped_conflicts,
        "error_rows": errors,
    }
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("audited", "strong_matches", "applied", "skipped_conflicts", "errors")}, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
