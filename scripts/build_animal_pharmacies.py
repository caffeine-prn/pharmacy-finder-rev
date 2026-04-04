import csv
import io
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict, Counter
from difflib import SequenceMatcher
import math
import time
import urllib.parse
import urllib.request


def normalize_text(value: str) -> str:
    if value is None:
        return ''
    # Normalize unicode to NFC to reduce filename/address variance
    text = unicodedata.normalize('NFC', str(value))
    # Remove HTML-like brackets and parentheses contents
    text = re.sub(r'\(.*?\)', ' ', text)
    # Replace commas/Chinese commas with spaces
    text = re.sub(r'[，,]', ' ', text)
    # Normalize hyphen between digits to space (e.g., 97-0 -> 97 0)
    text = re.sub(r'(?<=\d)\-(?=\d)', ' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_base_address(address: str) -> str:
    text = normalize_text(address)
    # Some rows have ", (동)" trailing – keep only before first comma-like split already handled
    return text


def extract_region_tokens(address: str):
    text = normalize_text(address)
    parts = text.split()
    if not parts:
        return '', ''
    sido = parts[0]
    sigungu = ''
    if len(parts) >= 2:
        # Handle patterns: "수원시 장안구", "창원시 마산회원구", "천안시 서북구" 등
        if parts[1].endswith('시') and len(parts) >= 3 and (parts[2].endswith('구') or parts[2].endswith('군')):
            sigungu = f"{parts[1]} {parts[2]}"
        else:
            sigungu = parts[1]
    return sido, sigungu


def normalize_name(value: str) -> str:
    """Aggressive normalization for name comparison.
    - remove common tokens like '동물', '약국'
    - keep Korean letters, numbers, and ASCII letters
    - remove spaces
    """
    s = normalize_text(value)
    # Remove common non-distinct tokens
    s = s.replace('동물', '')
    s = s.replace('약국', '')
    # Keep only letters and digits
    s = re.sub(r'[^0-9A-Za-z가-힣]', '', s)
    return s


def normalize_phone_digits(value: str) -> str:
    return re.sub(r'[^0-9]', '', value or '')


def sequence_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def to_bigrams(s: str):
    s = (s or '').replace(' ', '')
    return [s[i:i+2] for i in range(max(0, len(s)-1))]


def dice_coeff(a: str, b: str) -> float:
    A = to_bigrams(a)
    B = to_bigrams(b)
    if not A or not B:
        return 0.0
    m = Counter(A)
    inter = 0
    for x in B:
        if m.get(x, 0) > 0:
            inter += 1
            m[x] -= 1
    return (2 * inter) / (len(A) + len(B))


def haversine_m(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return None
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def find_animal_csv_path(cwd: str) -> str:
    candidates = []
    for name in os.listdir(cwd):
        if not name.lower().endswith('.csv'):
            continue
        nfc = unicodedata.normalize('NFC', name)
        nfd = unicodedata.normalize('NFD', name)
        if ('동물약국' in nfc) or ('동물약국' in nfd) or ('동물약국' in name):
            candidates.append(os.path.join(cwd, name))
    # Fallback to the known filename if present
    default_name = 'fulldata_02_03_02_P_동물약국.csv'
    default_path = os.path.join(cwd, default_name)
    if os.path.exists(default_path):
        return default_path
    if candidates:
        # Choose the latest modified
        candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return candidates[0]
    raise FileNotFoundError('동물약국 CSV 파일을 찾을 수 없습니다.')


def load_base_pharmacies(base_csv_path: str):
    with open(base_csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.reader(f)
        header = next(reader)
        # Map header names with BOM-stripped alias
        column_to_index = {}
        for i, name in enumerate(header):
            column_to_index[name] = i
            column_to_index[name.lstrip('\ufeff')] = i

        def gv(row, key):
            idx = column_to_index.get(key, -1)
            return (row[idx].strip() if 0 <= idx < len(row) else '')

        records = []
        region_index = defaultdict(list)  # key: (sido, sigungu) -> list[record]

        for row in reader:
            record = {
                'id': gv(row, '암호화요양기호'),
                'name': normalize_text(gv(row, '요양기관명')),
                'address': normalize_text(gv(row, '주소')),
                'phone': gv(row, '전화번호').strip(),
                'openDate': gv(row, '개설일자').strip(),
                'longitude': float(gv(row, '좌표(X)') or '0') or None,
                'latitude': float(gv(row, '좌표(Y)') or '0') or None,
            }
            record['baseAddress'] = extract_base_address(record['address'])
            record['nameKey'] = normalize_name(record['name'])
            record['baseAddressKey'] = normalize_text(record['baseAddress'])
            record['phoneDigits'] = normalize_phone_digits(record['phone'])
            sido, sigungu = extract_region_tokens(record['address'])
            record['sido'] = sido
            record['sigungu'] = sigungu
            records.append(record)
            region_index[(sido, sigungu)].append(record)
        return records, region_index


def load_animal_pharmacies(animal_csv_path: str):
    # CP949 encoded
    with open(animal_csv_path, 'r', encoding='cp949', newline='') as f:
        reader = csv.reader(f)
        header = next(reader)
        column_to_index = {}
        for i, name in enumerate(header):
            column_to_index[name] = i
            column_to_index[name.lstrip('\ufeff')] = i

        def gv(row, key):
            idx = column_to_index.get(key, -1)
            return (row[idx].strip() if 0 <= idx < len(row) else '')

        rows = []
        for row in reader:
            status = gv(row, '영업상태명')
            if status != '영업/정상':
                continue
            name = normalize_text(gv(row, '사업장명'))
            address_road = normalize_text(gv(row, '도로명전체주소'))
            address_lot = normalize_text(gv(row, '소재지전체주소'))
            address = address_road or address_lot
            phone = gv(row, '소재지전화').strip()
            mgmt_no = gv(row, '관리번호')
            x_val = gv(row, '좌표정보x(epsg5174)')
            y_val = gv(row, '좌표정보y(epsg5174)')
            sido, sigungu = extract_region_tokens(address)
            rows.append({
                'sourceId': mgmt_no,
                'name': name,
                'address': address,
                'baseAddress': extract_base_address(address),
                'nameKey': normalize_name(name),
                'baseAddressKey': normalize_text(extract_base_address(address)),
                'phone': phone,
                'phoneDigits': normalize_phone_digits(phone),
                'sido': sido,
                'sigungu': sigungu,
                'x5174': x_val,
                'y5174': y_val,
            })
        return rows


def match_record(animal, candidates):
    # 0) Phone exact match (strong signal)
    pd = animal.get('phoneDigits')
    if pd:
        phone_hits = [c for c in candidates if c.get('phoneDigits') and c['phoneDigits'] == pd]
        if len(phone_hits) == 1:
            return phone_hits[0], 'phone', 1.0
        elif len(phone_hits) > 1:
            # choose best by name similarity
            best = max(phone_hits, key=lambda c: sequence_ratio(animal.get('nameKey'), c.get('nameKey')))
            return best, 'phone+name', 0.95

    # 1) Exact match on normalized name + address
    name_a = animal['nameKey']
    addr_a = animal['baseAddressKey']
    for cand in candidates:
        if name_a and name_a == cand.get('nameKey') and addr_a and addr_a == cand.get('baseAddressKey'):
            return cand, 'exact', 1.0

    # 2) Fuzzy score: name 0.8, address 0.2 on normalized keys
    best = None
    best_score = 0.0
    for cand in candidates:
        name_score = sequence_ratio(name_a, cand.get('nameKey'))
        addr_score = sequence_ratio(addr_a, cand.get('baseAddressKey'))
        score = name_score * 0.8 + addr_score * 0.2
        if score > best_score:
            best_score = score
            best = cand
    if best and best_score >= 0.86:
        return best, 'fuzzy', best_score
    return None, 'none', 0.0


def build_output(animal_rows, base_region_index, base_all_records):
    matched = 0
    unmatched = 0
    by_method = Counter()
    output_rows = []

    for ar in animal_rows:
        candidates = base_region_index.get((ar['sido'], ar['sigungu']))
        if not candidates:
            # fallback to same sido
            candidates = [r for r in base_all_records if r['sido'] == ar['sido']]
        if not candidates:
            candidates = base_all_records

        cand, method, score = match_record(ar, candidates)
        if cand is not None:
            matched += 1
            by_method[method] += 1
            output_rows.append({
                'id': cand['id'],
                'name': ar['name'] or cand['name'],
                'sido': ar['sido'] or cand['sido'],
                'sigungu': ar['sigungu'] or cand['sigungu'],
                'address': ar['address'] or cand['address'],
                'phone': ar['phone'] or cand['phone'],
                'longitude': cand['longitude'],
                'latitude': cand['latitude'],
                'isAnimalPharmacy': True,
                'match': { 'matched': True, 'method': method, 'score': round(score, 4), 'sourceId': ar['sourceId'] }
            })
        else:
            unmatched += 1
            by_method['none'] += 1
            output_rows.append({
                'id': f"animal_{ar['sourceId']}",
                'name': ar['name'],
                'sido': ar['sido'],
                'sigungu': ar['sigungu'],
                'address': ar['address'],
                'phone': ar['phone'],
                'longitude': None,
                'latitude': None,
                'isAnimalPharmacy': True,
                'match': { 'matched': False, 'method': 'none', 'score': 0.0, 'sourceId': ar['sourceId'] }
            })

    stats = {
        'total_input': len(animal_rows),
        'matched': matched,
        'unmatched': unmatched,
        'method_breakdown': by_method,
    }
    return output_rows, stats


def kakao_keyword_search(query: str, x: str = None, y: str = None, key: str = None):
    if not key:
        return []
    params = {'query': query, 'size': '10'}
    if x and y:
        params['x'] = str(x)
        params['y'] = str(y)
        params['radius'] = '300'
    url = 'https://dapi.kakao.com/v2/local/search/keyword.json?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'Authorization': f'KakaoAK {key}'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
            return data.get('documents', [])
    except Exception:
        return []


def geocode_and_match(unmatched_rows, base_records, key: str, limit: int = 200, sleep_ms: int = 120):
    matched_updates = []
    tried = 0
    for a in unmatched_rows:
        if tried >= limit:
            break
        tried += 1
        q = normalize_text(f"{a.get('name','')} {a.get('baseAddress','')}")
        docs = kakao_keyword_search(q, key=key)
        if not docs:
            docs = kakao_keyword_search(normalize_text(a.get('address','')), key=key)
        if not docs:
            time.sleep(sleep_ms/1000.0)
            continue
        # pick best by PM9 boost + dice(name) + dice(address)
        name_key = a.get('nameKey')
        addr_key = a.get('baseAddressKey')
        best = None
        best_pri = -1e9
        for d in docs:
            is_pm9 = 1 if d.get('category_group_code') == 'PM9' else 0
            nm = normalize_text(d.get('place_name',''))
            ad = normalize_text(d.get('road_address_name') or d.get('address_name') or '')
            pri = is_pm9 * 8 + dice_coeff(name_key, normalize_name(nm)) * 4 + dice_coeff(addr_key, normalize_text(ad)) * 3
            if pri > best_pri:
                best_pri = pri
                best = d
        if not best:
            time.sleep(sleep_ms/1000.0)
            continue
        gx = float(best.get('x') or 0) or None
        gy = float(best.get('y') or 0) or None
        if gx is None or gy is None:
            time.sleep(sleep_ms/1000.0)
            continue
        # nearest base by distance + name similarity guard
        best_base = None
        best_dist = 1e18
        for b in base_records:
            dist = haversine_m(gy, gx, b['latitude'], b['longitude'])
            if dist is None:
                continue
            if dist < best_dist:
                best_dist = dist
                best_base = b
        if best_base is None:
            time.sleep(sleep_ms/1000.0)
            continue
        name_sim = sequence_ratio(name_key, best_base.get('nameKey'))
        if best_dist <= 70 and name_sim >= 0.5:
            matched_updates.append({
                'animal_sourceId': a.get('sourceId'),
                'new_id': best_base['id'],
                'method': 'geocode',
                'score': round((best_pri/15.0), 4),
                'longitude': best_base['longitude'],
                'latitude': best_base['latitude'],
            })
        time.sleep(sleep_ms/1000.0)
    return matched_updates


def main():
    cwd = os.getcwd()
    base_csv_path = os.path.join(cwd, 'asset', '2.약국정보서비스 2025.6.csv')
    animal_csv_path = find_animal_csv_path(cwd)

    base_records, base_region_index = load_base_pharmacies(base_csv_path)
    animal_rows = load_animal_pharmacies(animal_csv_path)

    output_rows, stats = build_output(animal_rows, base_region_index, base_records)

    # Try geocoding for unmatched items if Kakao key exists
    kakao_key = os.environ.get('KAKAO_REST_API')
    if kakao_key:
        unmatched_rows = [ar for ar, out in zip(animal_rows, output_rows) if not out['match']['matched']]
        updates = geocode_and_match(unmatched_rows, base_records, kakao_key, limit=200, sleep_ms=120)
        if updates:
            upd_by_src = {u['animal_sourceId']: u for u in updates}
            for i, out in enumerate(output_rows):
                m = out['match']
                if not m.get('matched'):
                    up = upd_by_src.get(m.get('sourceId'))
                    if up:
                        out['id'] = up['new_id']
                        out['longitude'] = up['longitude']
                        out['latitude'] = up['latitude']
                        out['match'] = {
                            'matched': True,
                            'method': up['method'],
                            'score': up['score'],
                            'sourceId': m.get('sourceId')
                        }
            # recompute stats
            stats['matched'] = sum(1 for o in output_rows if o['match']['matched'])
            stats['unmatched'] = len(output_rows) - stats['matched']
            # method breakdown rough update
            # rebuild breakdown
            mb = Counter(o['match']['method'] for o in output_rows)
            stats['method_breakdown'] = mb

    out_json_path = os.path.join(cwd, 'asset', 'animal_pharmacies.json')
    with open(out_json_path, 'w', encoding='utf-8') as f:
        json.dump({ 'animal_pharmacies': output_rows, 'stats': {
            'total_input': stats['total_input'],
            'matched': stats['matched'],
            'unmatched': stats['unmatched'],
            'method_breakdown': {k: int(v) if not isinstance(v, int) else v for k, v in (stats['method_breakdown'].items() if isinstance(stats['method_breakdown'], dict) else stats['method_breakdown'].items())},
        } }, f, ensure_ascii=False, indent=2)

    # Also print concise summary for the caller
    print(json.dumps({
        'output': 'asset/animal_pharmacies.json',
        'total_input': stats['total_input'],
        'matched': stats['matched'],
        'unmatched': stats['unmatched'],
        'method_breakdown': {k: int(v) if not isinstance(v, int) else v for k, v in (stats['method_breakdown'].items() if isinstance(stats['method_breakdown'], dict) else stats['method_breakdown'].items())},
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()


