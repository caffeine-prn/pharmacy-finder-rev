import csv
import json
import os
import re
import unicodedata
from collections import defaultdict, Counter
from difflib import SequenceMatcher
import math
import time
import urllib.parse
import urllib.request
import ssl


def normalize_text(value: str) -> str:
    if value is None:
        return ''
    text = unicodedata.normalize('NFC', str(value))
    text = re.sub(r'\(.*?\)', ' ', text)
    text = re.sub(r'[，,]', ' ', text)
    text = re.sub(r'(?<=\d)\-(?=\d)', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def clean_address_for_geocode(addr: str) -> str:
    s = normalize_text(addr)
    # remove building-related tokens
    s = re.sub(r'(\d+)[ ]*층', '', s)
    s = re.sub(r'(\d+)[ ]*호', '', s)
    s = s.replace('#', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def normalize_name(value: str) -> str:
    s = normalize_text(value)
    s = s.replace('약국', '')
    s = re.sub(r'[^0-9A-Za-z가-힣]', '', s)
    return s


def normalize_phone_digits(v: str) -> str:
    return re.sub(r'[^0-9]', '', v or '')


def extract_region(address: str):
    t = normalize_text(address)
    parts = t.split()
    if not parts:
        return '', ''
    sido = parts[0]
    sigungu = parts[1] if len(parts) > 1 else ''
    return sido, sigungu


def seq_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def load_base(base_csv_path: str):
    with open(base_csv_path, 'r', encoding='utf-8') as f:
        r = csv.reader(f)
        header = next(f).rstrip('\n').split(',')
    with open(base_csv_path, 'r', encoding='utf-8') as f:
        dr = csv.DictReader(f)
        rows = []
        for row in dr:
            name = normalize_text(row['요양기관명'])
            addr = normalize_text(row['주소'])
            rows.append({
                'id': row[list(dr.fieldnames)[0]],
                'name': name,
                'nameKey': normalize_name(name),
                'address': addr,
                'addrKey': normalize_text(addr),
                'phone': row.get('전화번호', ''),
                'phoneDigits': normalize_phone_digits(row.get('전화번호', '')),
                'longitude': float(row.get('좌표(X)', '') or '0') or None,
                'latitude': float(row.get('좌표(Y)', '') or '0') or None,
                'sido': extract_region(addr)[0],
                'sigungu': extract_region(addr)[1],
            })
    return rows


def load_full(full_csv_path: str):
    with open(full_csv_path, 'r', encoding='cp949', newline='') as f:
        r = csv.reader(f)
        header = next(r)
        col = {h: i for i, h in enumerate(header)}
        def gv(row, k):
            i = col.get(k, -1)
            return (row[i].strip() if 0 <= i < len(row) else '')
        out = []
        for row in r:
            if gv(row, '영업상태명') != '영업/정상':
                continue
            name = normalize_text(gv(row, '사업장명'))
            addr = normalize_text(gv(row, '도로명전체주소') or gv(row, '소재지전체주소'))
            phone = gv(row, '소재지전화').strip()
            mgmt = gv(row, '관리번호')
            x5174 = gv(row, '좌표정보x(epsg5174)')
            y5174 = gv(row, '좌표정보y(epsg5174)')
            sido, sigungu = extract_region(addr)
            out.append({
                'sourceId': mgmt,
                'name': name,
                'nameKey': normalize_name(name),
                'address': addr,
                'addrKey': normalize_text(addr),
                'phone': phone,
                'phoneDigits': normalize_phone_digits(phone),
                'sido': sido,
                'sigungu': sigungu,
                'x5174': x5174,
                'y5174': y5174,
            })
    return out


def compute_difference(full_rows, base_rows):
    # quick phone index
    phone_to_base = defaultdict(list)
    for b in base_rows:
        if b['phoneDigits']:
            phone_to_base[b['phoneDigits']].append(b)

    extras = []
    for fr in full_rows:
        # 1) phone exact
        if fr['phoneDigits'] and phone_to_base.get(fr['phoneDigits']):
            # likely exists in base
            continue
        # 2) region-narrowed fuzzy
        candidates = [b for b in base_rows if b['sido'] == fr['sido'] and (not fr['sigungu'] or b['sigungu'] == fr['sigungu'])]
        best = None
        best_score = 0
        for b in candidates[:3000]:
            s = seq_ratio(fr['nameKey'], b['nameKey']) * 0.7 + seq_ratio(fr['addrKey'], b['addrKey']) * 0.3
            if s > best_score:
                best_score = s
                best = b
        if best and best_score >= 0.9:
            # very likely same
            continue
        extras.append(fr)
    return extras


def kakao_geocode(addr: str, key: str):
    if not key or not addr:
        return None, None
    url = 'https://dapi.kakao.com/v2/local/search/address.json?' + urllib.parse.urlencode({'query': addr})
    req = urllib.request.Request(url, headers={'Authorization': f'KakaoAK {key}'})
    ctx = None
    if os.environ.get('DISABLE_SSL_VERIFY') == '1':
        ctx = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = json.load(resp)
            docs = data.get('documents', [])
            if not docs:
                return None, None
            d = docs[0]
            x = float(d.get('x')) if d.get('x') else None
            y = float(d.get('y')) if d.get('y') else None
            return x, y
    except Exception:
        return None, None


def kakao_keyword(query: str, key: str):
    if not key or not query:
        return None, None
    url = 'https://dapi.kakao.com/v2/local/search/keyword.json?' + urllib.parse.urlencode({'query': query, 'size': '3'})
    req = urllib.request.Request(url, headers={'Authorization': f'KakaoAK {key}'})
    ctx = None
    if os.environ.get('DISABLE_SSL_VERIFY') == '1':
        ctx = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = json.load(resp)
            docs = data.get('documents', [])
            if not docs:
                return None, None
            d = docs[0]
            x = float(d.get('x')) if d.get('x') else None
            y = float(d.get('y')) if d.get('y') else None
            return x, y
    except Exception:
        return None, None


def build_queries(fr):
    # priority: address, then name + region, then name only
    q1 = clean_address_for_geocode(fr['address'])
    parts = [fr.get('sido') or '', fr.get('sigungu') or '', fr.get('name') or '']
    q2 = normalize_text(' '.join([p for p in parts if p]))
    q3 = normalize_text(fr.get('name') or '')
    return [q1, q2, q3]


def main():
    cwd = os.getcwd()
    base_csv = os.path.join(cwd, 'asset', '2.약국정보서비스 2025.6.csv')
    full_csv = os.path.join(cwd, 'fulldata_01_01_06_P_약국.csv')
    base_rows = load_base(base_csv)
    full_rows = load_full(full_csv)
    extras = compute_difference(full_rows, base_rows)

    key = os.environ.get('KAKAO_REST_API')
    geocoded = 0
    out = []
    # limit geocoding to reduce rate-limit hits; can be overridden by env
    limit = int(os.environ.get('GEOCODE_LIMIT', '300'))
    for i, fr in enumerate(extras):
        if i >= limit:
            out.append({
                'id': f"extra_{fr['sourceId']}",
                'name': fr['name'],
                'sido': fr['sido'],
                'sigungu': fr['sigungu'],
                'address': fr['address'],
                'phone': fr['phone'],
                'longitude': None,
                'latitude': None,
                'isExtraPharmacy': True
            })
            continue
        lon = lat = None
        if key:
            # multi-strategy queries
            for q in build_queries(fr):
                if not q:
                    continue
                lon, lat = kakao_geocode(q, key)
                if lon and lat:
                    break
                lon, lat = kakao_keyword(q, key)
                if lon and lat:
                    break
            if lon and lat:
                geocoded += 1
            # rate-limit guard
            if (i % 8) == 0:
                time.sleep(0.2)
        out.append({
            'id': f"extra_{fr['sourceId']}",
            'name': fr['name'],
            'sido': fr['sido'],
            'sigungu': fr['sigungu'],
            'address': fr['address'],
            'phone': fr['phone'],
            'longitude': lon,
            'latitude': lat,
            'isExtraPharmacy': True
        })

    out_path = os.path.join(cwd, 'asset', 'pharmacies_extra.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({'extra_pharmacies': out, 'stats': {'total_full': len(full_rows), 'base': len(base_rows), 'extra': len(out), 'geocoded': geocoded}}, f, ensure_ascii=False, indent=2)

    print(json.dumps({'output': 'asset/pharmacies_extra.json', 'extra': len(out), 'geocoded': geocoded}, ensure_ascii=False))


if __name__ == '__main__':
    main()


