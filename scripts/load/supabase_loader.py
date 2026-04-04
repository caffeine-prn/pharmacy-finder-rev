import os
from datetime import datetime, timezone
from supabase import create_client


def get_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def upsert_pharmacies(client, pharmacies: list[dict], batch_size: int = 500) -> int:
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
    count = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
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


def update_freshness(client, source: str, data_date: str, record_count: int, notes: str = ""):
    client.table("data_freshness").upsert({
        "source": source,
        "last_sync": datetime.now(timezone.utc).isoformat(),
        "data_date": data_date,
        "record_count": record_count,
        "notes": notes,
    }, on_conflict="source").execute()


def log_sync(client, sync_type: str, started_at, status: str,
             pharmacy_count: int = 0, animal_count: int = 0,
             staff_count: int = 0, errors=None, metadata=None):
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
    }).execute()
