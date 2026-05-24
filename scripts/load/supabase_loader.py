import os
import re
from datetime import date, datetime, timedelta, timezone
from supabase import create_client


def _chunks(items, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _dedupe_rows_by_key(rows: list[dict], key: str) -> list[dict]:
    """Keep one row per upsert key so Postgres ON CONFLICT sees each row once."""
    deduped_by_key = {}
    for row in rows:
        value = row.get(key)
        if value:
            deduped_by_key[value] = row
    return list(deduped_by_key.values())


def _date_yyyymmdd_to_iso(value: str | None):
    if not value:
        return None
    value = str(value).strip()
    if len(value) == 8 and value.isdigit():
        return f"{value[:4]}-{value[4:6]}-{value[6:]}"
    return value


def get_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def upsert_pharmacies(client, pharmacies: list[dict], batch_size: int = 500) -> int:
    # Deduplicate by ykiho (multiple LOCALDATA records can match same HIRA ykiho)
    seen_ykiho = set()
    deduped = []
    for p in pharmacies:
        yk = p.get("ykiho")
        if yk and yk in seen_ykiho:
            continue
        if yk:
            seen_ykiho.add(yk)
        deduped.append(p)
    pharmacies = deduped

    rows = []
    for p in pharmacies:
        lng, lat = p.get("longitude"), p.get("latitude")
        location = f"POINT({lng} {lat})" if lng and lat else None
        rows.append({
            "id": p["id"],
            "ykiho": p.get("ykiho"),
            "name": p["name"],
            "sido": p.get("sido", ""),
            "sigungu": p.get("sigungu", ""),
            "address": p.get("address", ""),
            "road_address": p.get("road_address", ""),
            "phone": p.get("phone", ""),
            "open_date": p.get("open_date"),
            "mois_license_date": _date_yyyymmdd_to_iso(p.get("mois_license_date") or p.get("open_date")),
            "mois_closed_date": _date_yyyymmdd_to_iso(p.get("mois_closed_date")),
            "mois_detail_status_code": p.get("mois_detail_status_code"),
            "mois_detail_status_name": p.get("mois_detail_status_name"),
            "mois_data_updated_at": p.get("mois_data_updated_at"),
            "hira_open_date": _date_yyyymmdd_to_iso(p.get("hira_open_date")),
            "hira_last_event_type": p.get("hira_last_event_type"),
            "hira_last_event_date": _date_yyyymmdd_to_iso(p.get("hira_last_event_date")),
            "longitude": lng,
            "latitude": lat,
            "location": location,
            "business_status": p.get("business_status", "영업중"),
            "business_status_code": p.get("business_status_code", "01"),
            "has_ykiho": p.get("has_ykiho", False),
            "is_animal_pharmacy": p.get("is_animal_pharmacy", False),
            "is_herbal_pharmacy": p.get("is_herbal_pharmacy", False),
            "is_cross_employed": p.get("is_cross_employed", False),
            "pharmacist_count": p.get("pharmacist_count", 0),
            "herbal_pharmacist_count": p.get("herbal_pharmacist_count", 0),
            "hira_staff_fetched_at": p.get("hira_staff_fetched_at"),
            "hira_staff_total_count": p.get("hira_staff_total_count"),
            "hours_mon": p.get("hours_mon"),
            "hours_tue": p.get("hours_tue"),
            "hours_wed": p.get("hours_wed"),
            "hours_thu": p.get("hours_thu"),
            "hours_fri": p.get("hours_fri"),
            "hours_sat": p.get("hours_sat"),
            "hours_sun": p.get("hours_sun"),
            "hours_hol": p.get("hours_hol"),
            "localdata_id": p.get("localdata_id", p["id"]),
            "nmc_id": p.get("nmc_id"),
            "source": p.get("source", "localdata"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    ykihos = {row["ykiho"] for row in rows if row.get("ykiho")}
    existing_by_ykiho = {}
    offset = 0
    while ykihos:
        resp = (
            client.table("pharmacies")
            .select(
                "id,ykiho,pharmacist_count,herbal_pharmacist_count,"
                "is_herbal_pharmacy,is_cross_employed,hira_staff_fetched_at,"
                "hira_staff_total_count"
            )
            .range(offset, offset + 999)
            .execute()
        )
        for existing in resp.data or []:
            ykiho = existing.get("ykiho")
            if ykiho in ykihos and existing.get("id"):
                existing_by_ykiho[ykiho] = existing
        if len(resp.data or []) < 1000:
            break
        if ykihos <= existing_by_ykiho.keys():
            break
        offset += 1000

    for row in rows:
        existing = existing_by_ykiho.get(row.get("ykiho"))
        if existing:
            row["id"] = existing["id"]
            if existing.get("hira_staff_fetched_at"):
                row["pharmacist_count"] = existing.get("pharmacist_count") or 0
                row["herbal_pharmacist_count"] = existing.get("herbal_pharmacist_count") or 0
                row["is_herbal_pharmacy"] = existing.get("is_herbal_pharmacy") or False
                row["is_cross_employed"] = existing.get("is_cross_employed") or False
                row["hira_staff_fetched_at"] = existing.get("hira_staff_fetched_at")
                row["hira_staff_total_count"] = existing.get("hira_staff_total_count")

    rows = _dedupe_rows_by_key(rows, "id")

    count = 0
    for batch in _chunks(rows, batch_size):
        client.table("pharmacies").upsert(batch, on_conflict="id").execute()
        count += len(batch)
        print(f"  Upserted {count}/{len(rows)} pharmacies")
    return count


def upsert_staff(
    client,
    staff: dict[str, dict],
    data_period: str,
    skip_ykihos: set[str] | None = None,
) -> int:
    skip_ykihos = skip_ykihos or set()
    rows = []
    for ykiho, info in staff.items():
        if ykiho in skip_ykihos:
            continue
        if info.get("pharmacist", 0) > 0:
            rows.append({
                "ykiho": ykiho,
                "staff_type_code": "071",
                "staff_type_name": "약사",
                "staff_count": info["pharmacist"],
                "data_period": data_period,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
        if info.get("herbal_pharmacist", 0) > 0:
            rows.append({
                "ykiho": ykiho,
                "staff_type_code": "072",
                "staff_type_name": "한약사",
                "staff_count": info["herbal_pharmacist"],
                "data_period": data_period,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
    if rows:
        client.table("pharmacy_staff").upsert(rows, on_conflict="ykiho,staff_type_code").execute()
    return len(rows)


def upsert_mois_raw(client, rows: list[dict], batch_size: int = 500) -> int:
    count = 0
    for batch in _chunks(rows, batch_size):
        client.table("mois_facility_raw").upsert(
            batch,
            on_conflict="source,mng_no",
        ).execute()
        count += len(batch)
        print(f"  Upserted {count}/{len(rows)} MOIS raw rows")
    return count


def upsert_hira_opclo_raw(client, rows: list[dict], batch_size: int = 500) -> int:
    db_rows = []
    for row in rows:
        ykiho = row.get("ykiho")
        event_type = row.get("event_type")
        event_date = row.get("event_date")
        if not ykiho or not event_type or not event_date:
            continue
        db_rows.append({
            "ykiho": ykiho,
            "name": row.get("name", ""),
            "category": row.get("category", ""),
            "sido": row.get("sido", ""),
            "sido_code": row.get("sido_code", ""),
            "address": row.get("address", ""),
            "phone": row.get("phone", ""),
            "event_type": event_type,
            "event_date": _date_yyyymmdd_to_iso(event_date),
            "crtr_ym": row.get("crtr_ym", ""),
            "raw": row.get("raw", row),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    count = 0
    for batch in _chunks(db_rows, batch_size):
        client.table("hira_opclo_raw").upsert(
            batch,
            on_conflict="ykiho,event_type,event_date",
        ).execute()
        count += len(batch)
        print(f"  Upserted {count}/{len(db_rows)} HIRA op/clo rows")
    return count


def _parse_iso_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def _coalesced_open_date(row: dict):
    return _parse_iso_date(
        row.get("mois_license_date")
        or row.get("hira_open_date")
        or row.get("open_date")
    )


def fetch_staff_lookup_candidates(
    client,
    baseline_date: date,
    until_date: date,
    limit: int | None = None,
) -> list[dict]:
    """Find active ykiho pharmacies opened after the staff CSV baseline.

    These are pharmacies missing post-CSV staff composition and should receive
    the on-demand HIRA staff lookup once.
    """
    candidates = []
    offset = 0
    while True:
        resp = (
            client.table("pharmacies")
            .select(
                "id,name,ykiho,open_date,mois_license_date,hira_open_date,"
                "hira_staff_fetched_at,business_status,mois_closed_date,has_ykiho"
            )
            .eq("has_ykiho", True)
            .is_("hira_staff_fetched_at", "null")
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        for row in rows:
            if not row.get("ykiho"):
                continue
            if row.get("mois_closed_date"):
                continue
            if row.get("business_status") not in (None, "", "영업/정상", "영업중"):
                continue
            open_date = _coalesced_open_date(row)
            if not open_date:
                continue
            if open_date < baseline_date or open_date > until_date:
                continue
            row["staff_lookup_open_date"] = open_date.isoformat()
            candidates.append(row)
            if limit and len(candidates) >= limit:
                return candidates
        if len(rows) < 1000:
            break
        offset += 1000
    return candidates


def _parse_timestamp(value: str | None):
    if not value:
        return None
    normalized = str(value).strip().replace(" ", "T").replace("Z", "+00:00")
    normalized = re.sub(r"([+-]\d{2})$", r"\1:00", normalized)
    normalized = re.sub(
        r"\.(\d{1,6})([+-]\d{2}:\d{2})$",
        lambda match: f".{match.group(1).ljust(6, '0')}{match.group(2)}",
        normalized,
    )
    return datetime.fromisoformat(normalized)


def fetch_staff_lookup_due_candidates(
    client,
    limit: int,
    refresh_days: int = 1,
) -> list[dict]:
    """Find active ykiho pharmacies due for rolling HIRA staff lookup.

    Priority is:
    1. Never looked up
    2. Oldest lookup timestamp first

    This lets a daily capped batch eventually cycle through all HIRA-matched
    pharmacies without repeatedly hammering recently refreshed rows.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=refresh_days)
    candidates = []
    offset = 0
    while True:
        resp = (
            client.table("pharmacies")
            .select(
                "id,name,ykiho,open_date,mois_license_date,hira_open_date,"
                "hira_staff_fetched_at,business_status,mois_closed_date,has_ykiho"
            )
            .eq("has_ykiho", True)
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        for row in rows:
            if not row.get("ykiho"):
                continue
            if row.get("mois_closed_date"):
                continue
            if row.get("business_status") not in (None, "", "영업/정상", "영업중"):
                continue
            fetched_at = _parse_timestamp(row.get("hira_staff_fetched_at"))
            if fetched_at and fetched_at > cutoff:
                continue
            candidates.append(row)
        if len(rows) < 1000:
            break
        offset += 1000

    candidates.sort(
        key=lambda row: (
            row.get("hira_staff_fetched_at") is not None,
            row.get("hira_staff_fetched_at") or "",
            row.get("mois_license_date") or row.get("hira_open_date") or row.get("open_date") or "",
            row.get("id") or "",
        )
    )
    return candidates[:limit]


def fetch_staff_lookup_updates(client) -> dict[str, dict]:
    updates = {}
    offset = 0
    while True:
        resp = (
            client.table("pharmacies")
            .select(
                "ykiho,pharmacist_count,herbal_pharmacist_count,"
                "is_herbal_pharmacy,is_cross_employed,hira_staff_fetched_at,"
                "hira_staff_total_count"
            )
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        for row in rows:
            ykiho = row.get("ykiho")
            if ykiho and row.get("hira_staff_fetched_at"):
                updates[ykiho] = row
        if len(rows) < 1000:
            break
        offset += 1000
    return updates


def upsert_staff_lookup_result(
    client,
    pharmacy: dict,
    rows: list[dict],
    total_count: int,
    fetched_at: str | None = None,
) -> int:
    fetched_at = fetched_at or datetime.now(timezone.utc).isoformat()
    ykiho = pharmacy["ykiho"]

    raw_rows = []
    for row in rows:
        if not row.get("ykiho"):
            row["ykiho"] = ykiho
        if not row.get("staff_type_code"):
            continue
        raw_rows.append({
            "ykiho": row["ykiho"],
            "staff_type_code": row.get("staff_type_code"),
            "staff_type_name": row.get("staff_type_name"),
            "staff_count": row.get("staff_count", 0),
            "pharmacy_name": row.get("pharmacy_name") or pharmacy.get("name", ""),
            "raw": row.get("raw", row),
            "fetched_at": fetched_at,
            "updated_at": fetched_at,
        })

    if raw_rows:
        client.table("hira_staff_lookup_raw").upsert(
            raw_rows,
            on_conflict="ykiho,staff_type_code",
        ).execute()

        staff_rows = [
            {
                "ykiho": row["ykiho"],
                "pharmacy_name": row.get("pharmacy_name") or pharmacy.get("name", ""),
                "staff_type_code": row.get("staff_type_code"),
                "staff_type_name": row.get("staff_type_name"),
                "staff_count": row.get("staff_count", 0),
                "data_period": "on_demand",
                "updated_at": fetched_at,
            }
            for row in raw_rows
        ]
        client.table("pharmacy_staff").upsert(
            staff_rows,
            on_conflict="ykiho,staff_type_code",
        ).execute()

    pharmacist_count = sum(
        int(row.get("staff_count") or 0)
        for row in rows
        if row.get("staff_type_code") == "071" or row.get("staff_type_name") == "약사"
    )
    herbal_pharmacist_count = sum(
        int(row.get("staff_count") or 0)
        for row in rows
        if row.get("staff_type_code") == "072" or row.get("staff_type_name") == "한약사"
    )

    client.table("pharmacies").update({
        "pharmacist_count": pharmacist_count,
        "herbal_pharmacist_count": herbal_pharmacist_count,
        "is_herbal_pharmacy": herbal_pharmacist_count > 0,
        "is_cross_employed": pharmacist_count > 0 and herbal_pharmacist_count > 0,
        "hira_staff_fetched_at": fetched_at,
        "hira_staff_total_count": total_count,
        "updated_at": fetched_at,
    }).eq("id", pharmacy["id"]).execute()

    return len(raw_rows)


def update_freshness(client, source: str, data_date: str, record_count: int, notes: str = ""):
    client.table("data_freshness").upsert({
        "source": source,
        "last_sync": datetime.now(timezone.utc).isoformat(),
        "data_date": data_date,
        "record_count": record_count,
        "notes": notes,
    }, on_conflict="source").execute()


def detect_changes(client, new_pharmacies: list[dict]) -> dict:
    """Compare new data with existing DB to detect opened/closed/changed pharmacies.
    Returns {new_ids: [...], closed_ids: [...], changed: [...], counts: {...}}
    """
    # Fetch existing IDs from DB
    existing = {}
    offset = 0
    while True:
        resp = (
            client.table("pharmacies")
            .select(
                "id, name, pharmacist_count, herbal_pharmacist_count, "
                "is_animal_pharmacy, business_status, business_status_code, "
                "mois_closed_date"
            )
            .range(offset, offset + 999)
            .execute()
        )
        for r in resp.data:
            existing[r["id"]] = r
        if len(resp.data) < 1000:
            break
        offset += 1000

    new_ids_set = {p["id"] for p in new_pharmacies}
    active_existing = {
        pid: row
        for pid, row in existing.items()
        if not _is_existing_closed(row)
    }
    active_existing_ids_set = set(active_existing.keys())

    # Detect new (opened)
    opened = new_ids_set - active_existing_ids_set
    # Detect closed (in DB but not in new data)
    closed = active_existing_ids_set - new_ids_set

    # Detect changes in key fields
    changed = []
    for p in new_pharmacies:
        pid = p["id"]
        if pid not in active_existing or pid in opened:
            continue
        old = active_existing[pid]
        diffs = {}
        if p.get("pharmacist_count", 0) != (old.get("pharmacist_count") or 0):
            diffs["pharmacist_count"] = {"old": old.get("pharmacist_count", 0), "new": p.get("pharmacist_count", 0)}
        if p.get("herbal_pharmacist_count", 0) != (old.get("herbal_pharmacist_count") or 0):
            diffs["herbal_pharmacist_count"] = {"old": old.get("herbal_pharmacist_count", 0), "new": p.get("herbal_pharmacist_count", 0)}
        if p.get("is_animal_pharmacy", False) != (old.get("is_animal_pharmacy") or False):
            diffs["is_animal_pharmacy"] = {"old": old.get("is_animal_pharmacy", False), "new": p.get("is_animal_pharmacy", False)}
        if diffs:
            changed.append({"id": pid, "name": p.get("name", ""), "diffs": diffs})

    # Build pharmacy name lookup for changelog
    new_by_id = {p["id"]: p.get("name", "") for p in new_pharmacies}

    # Insert changelog entries
    changelog_rows = []
    for pid in opened:
        changelog_rows.append({
            "pharmacy_id": pid,
            "pharmacy_name": new_by_id.get(pid, ""),
            "event_type": "opened",
            "details": None,
        })
    for pid in closed:
        changelog_rows.append({
            "pharmacy_id": pid,
            "pharmacy_name": active_existing.get(pid, {}).get("name", ""),
            "event_type": "closed",
            "details": None,
        })
    for c in changed:
        changelog_rows.append({
            "pharmacy_id": c["id"],
            "pharmacy_name": c["name"],
            "event_type": "staff_changed" if any(k in c["diffs"] for k in ("pharmacist_count", "herbal_pharmacist_count")) else "info_changed",
            "details": c["diffs"],
        })

    if changelog_rows:
        # Batch insert
        for i in range(0, len(changelog_rows), 500):
            client.table("pharmacy_changelog").insert(changelog_rows[i:i+500]).execute()

    _mark_closed_pharmacies(client, sorted(closed))

    return {
        "new_count": len(opened),
        "closed_count": len(closed),
        "changed_count": len(changed),
    }


def _is_existing_closed(row: dict) -> bool:
    if row.get("mois_closed_date"):
        return True
    if row.get("business_status_code") in ("02", "03"):
        return True
    return row.get("business_status") in ("휴업", "폐업")


def _mark_closed_pharmacies(client, closed_ids: list[str], batch_size: int = 500):
    if not closed_ids:
        return
    now = datetime.now(timezone.utc).isoformat()
    patch = {
        "business_status": "폐업",
        "business_status_code": "03",
        "updated_at": now,
    }
    for batch in _chunks(closed_ids, batch_size):
        client.table("pharmacies").update(patch).in_("id", batch).execute()


def log_sync(client, sync_type: str, started_at, status: str,
             pharmacy_count: int = 0, animal_count: int = 0,
             staff_count: int = 0, errors=None, metadata=None,
             new_pharmacies: int = 0, closed_pharmacies: int = 0, changed_pharmacies: int = 0):
    client.table("sync_log").insert({
        "sync_type": sync_type,
        "started_at": started_at,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "pharmacy_count": pharmacy_count,
        "animal_count": animal_count,
        "staff_count": staff_count,
        "errors": errors,
        "metadata": metadata,
        "new_pharmacies": new_pharmacies,
        "closed_pharmacies": closed_pharmacies,
        "changed_pharmacies": changed_pharmacies,
    }).execute()
