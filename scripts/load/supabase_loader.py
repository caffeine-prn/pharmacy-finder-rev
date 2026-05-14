import os
from datetime import datetime, timezone
from supabase import create_client


def _chunks(items, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


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
    existing_ids_by_ykiho = {}
    offset = 0
    while ykihos:
        resp = (
            client.table("pharmacies")
            .select("id,ykiho")
            .range(offset, offset + 999)
            .execute()
        )
        for existing in resp.data or []:
            ykiho = existing.get("ykiho")
            if ykiho in ykihos and existing.get("id"):
                existing_ids_by_ykiho[ykiho] = existing["id"]
        if len(resp.data or []) < 1000:
            break
        if ykihos <= existing_ids_by_ykiho.keys():
            break
        offset += 1000

    for row in rows:
        existing_id = existing_ids_by_ykiho.get(row.get("ykiho"))
        if existing_id:
            row["id"] = existing_id

    count = 0
    for batch in _chunks(rows, batch_size):
        client.table("pharmacies").upsert(batch, on_conflict="id").execute()
        count += len(batch)
        print(f"  Upserted {count}/{len(rows)} pharmacies")
    return count


def upsert_staff(client, staff: dict[str, dict], data_period: str) -> int:
    rows = []
    for ykiho, info in staff.items():
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
        resp = client.table("pharmacies").select("id, name, pharmacist_count, herbal_pharmacist_count, is_animal_pharmacy").range(offset, offset + 999).execute()
        for r in resp.data:
            existing[r["id"]] = r
        if len(resp.data) < 1000:
            break
        offset += 1000

    new_ids_set = {p["id"] for p in new_pharmacies}
    existing_ids_set = set(existing.keys())

    # Detect new (opened)
    opened = new_ids_set - existing_ids_set
    # Detect closed (in DB but not in new data)
    closed = existing_ids_set - new_ids_set

    # Detect changes in key fields
    changed = []
    for p in new_pharmacies:
        pid = p["id"]
        if pid not in existing or pid in opened:
            continue
        old = existing[pid]
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
            "pharmacy_name": existing.get(pid, {}).get("name", ""),
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

    return {
        "new_count": len(opened),
        "closed_count": len(closed),
        "changed_count": len(changed),
    }


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
