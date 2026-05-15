import json
from datetime import datetime, timezone


def generate_markers_json(pharmacies: list[dict], output_path: str) -> str:
    """Generate compact markers.json for CDN serving.
    Uses abbreviated keys: n=name, lng/lat, h=herbal, a=animal, c=cross,
    y=ykiho, s=sido, g=sigungu, p=phone, o=open date.
    """
    markers = []
    for p in pharmacies:
        if p.get("longitude") is None or p.get("latitude") is None:
            continue
        if p.get("mois_closed_date") or p.get("business_status") not in (None, "", "영업/정상", "영업중"):
            continue
        open_date = p.get("mois_license_date") or p.get("hira_open_date") or p.get("open_date") or ""
        if open_date:
            open_date = str(open_date)[:10]
        markers.append({
            "id": p["id"],
            "n": p["name"],
            "lng": p["longitude"],
            "lat": p["latitude"],
            "h": p.get("is_herbal_pharmacy", False),
            "a": p.get("is_animal_pharmacy", False),
            "c": p.get("is_cross_employed", False),
            "y": p.get("has_ykiho", False),
            "s": p.get("sido", ""),
            "g": p.get("sigungu", ""),
            "p": p.get("phone", ""),
            "o": open_date,
        })
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(markers),
        "pharmacies": markers,
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    return output_path
