import math
from transform.normalizer import normalize_name, normalize_address


def _dice_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    a_bigrams = set(a[i:i+2] for i in range(len(a)-1))
    b_bigrams = set(b[i:i+2] for i in range(len(b)-1))
    if not a_bigrams or not b_bigrams:
        return 0.0
    return 2 * len(a_bigrams & b_bigrams) / (len(a_bigrams) + len(b_bigrams))


def _distance_m(lon1, lat1, lon2, lat2):
    if None in (lon1, lat1, lon2, lat2):
        return float("inf")
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(a))


def match_localdata_to_hira(localdata, hira):
    hira_by_name = {}
    for h in hira:
        key = normalize_name(h["name"])
        hira_by_name.setdefault(key, []).append(h)

    matched = []
    unmatched = []

    for ld in localdata:
        ld_name_norm = normalize_name(ld["name"])
        ld_addr_norm = normalize_address(ld.get("road_address") or ld.get("address", ""))
        best_match = None
        best_score = 0.0

        candidates = hira_by_name.get(ld_name_norm, [])
        for h in candidates:
            h_addr_norm = normalize_address(h.get("address", ""))
            addr_sim = _dice_similarity(ld_addr_norm, h_addr_norm)
            dist = _distance_m(
                ld.get("longitude"), ld.get("latitude"),
                h.get("longitude"), h.get("latitude")
            )
            score = addr_sim
            if dist < 50:
                score += 0.3
            elif dist < 200:
                score += 0.1
            if score > best_score:
                best_score = score
                best_match = h

        if best_match and best_score >= 0.3:
            merged = {
                **ld,
                "ykiho": best_match["ykiho"],
                "has_ykiho": True,
                "hira_open_date": best_match.get("open_date"),
            }
            if best_match.get("longitude") and best_match.get("latitude"):
                merged["longitude"] = best_match["longitude"]
                merged["latitude"] = best_match["latitude"]
            matched.append(merged)
        else:
            unmatched.append({**ld, "ykiho": None, "has_ykiho": False})

    return matched, unmatched


def apply_hira_opclo_status(pharmacies, opclo_events):
    """Attach the latest HIRA open/close/suspension event to matched pharmacies."""
    latest_by_ykiho = {}
    for event in opclo_events:
        ykiho = event.get("ykiho")
        event_date = event.get("event_date") or ""
        if not ykiho or not event_date:
            continue
        previous = latest_by_ykiho.get(ykiho)
        if previous is None or event_date >= (previous.get("event_date") or ""):
            latest_by_ykiho[ykiho] = event

    status_by_event = {
        "개업": ("영업중", "01"),
        "폐업": ("폐업", "03"),
        "휴업": ("휴업", "02"),
    }
    for p in pharmacies:
        event = latest_by_ykiho.get(p.get("ykiho"))
        if not event:
            continue
        p["hira_opclo_event_type"] = event.get("event_type")
        p["hira_opclo_event_date"] = event.get("event_date")
        p["hira_last_event_type"] = event.get("event_type")
        p["hira_last_event_date"] = event.get("event_date")
        status = status_by_event.get(event.get("event_type"))
        if status:
            p["hira_business_status"] = status[0]
            if event.get("event_type") != "개업":
                p["business_status"] = status[0]
                p["business_status_code"] = status[1]
    return pharmacies


def match_to_animal(pharmacies, animals):
    pharm_by_name = {}
    for p in pharmacies:
        key = normalize_name(p["name"])
        pharm_by_name.setdefault(key, []).append(p)

    matched_animal_ids = set()
    for a in animals:
        a_name = normalize_name(a["name"])
        candidates = pharm_by_name.get(a_name, [])
        for p in candidates:
            dist = _distance_m(
                p.get("longitude"), p.get("latitude"),
                a.get("longitude"), a.get("latitude")
            )
            if dist < 200:
                p["is_animal_pharmacy"] = True
                matched_animal_ids.add(a["id"])
                break

    for p in pharmacies:
        p.setdefault("is_animal_pharmacy", False)

    unmatched_animals = [a for a in animals if a["id"] not in matched_animal_ids]
    return pharmacies, unmatched_animals


def classify_herbal(pharmacies, staff):
    """COVID-19 note: HIRA-matched with herbal_pharmacist only = herbal (한약사 단독 개국)."""
    for p in pharmacies:
        ykiho = p.get("ykiho")
        info = staff.get(ykiho, {}) if ykiho else {}
        pharmacist_count = info.get("pharmacist", 0)
        herbal_count = info.get("herbal_pharmacist", 0)
        p["pharmacist_count"] = pharmacist_count
        p["herbal_pharmacist_count"] = herbal_count
        p["is_herbal_pharmacy"] = herbal_count > 0
        p["is_cross_employed"] = pharmacist_count > 0 and herbal_count > 0
    return pharmacies
