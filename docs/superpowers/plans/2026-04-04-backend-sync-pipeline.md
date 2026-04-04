# Backend: Data Sync Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated daily sync pipeline that fetches pharmacy data from 4 public sources, merges them into Supabase, and generates a static JSON file for the frontend map.

**Architecture:** Python scripts orchestrated by GitHub Actions cron. Each source has its own fetcher module. A transform layer handles coordinate conversion and cross-source matching. A loader layer upserts to Supabase and generates CDN JSON. All scripts run in a single GitHub Actions job (~35min).

**Tech Stack:** Python 3.11, pyproj, openpyxl, supabase-py, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-04-pharmacy-sync-redesign.md`
**Data guide:** `docs/superpowers/specs/2026-04-04-data-sources-guide.md`

---

## File Structure

```
scripts/
├── sync_daily.py              -- Orchestrator: calls sources → transform → load
├── sources/
│   ├── __init__.py
│   ├── localdata.py           -- Download + parse LOCALDATA pharmacy & animal CSV
│   ├── hira_pharmacy.py       -- Fetch HIRA pharmacy API (paginated)
│   ├── nmc_pharmacy.py        -- Fetch 국립중앙의료원 API (operating hours)
│   └── hira_staff.py          -- Parse HIRA quarterly XLSX staff file
├── transform/
│   ├── __init__.py
│   ├── coordinate.py          -- EPSG:5174 → WGS84 conversion
│   ├── normalizer.py          -- Name/address normalization
│   └── matcher.py             -- Cross-source matching (LOCALDATA ↔ HIRA ↔ NMC ↔ animal)
├── load/
│   ├── __init__.py
│   ├── supabase_loader.py     -- Upsert pharmacies + staff + freshness to Supabase
│   └── cdn_json.py            -- Generate markers.json, upload to Supabase Storage
├── utils/
│   ├── __init__.py
│   ├── csv_parser.py          -- EUC-KR CSV parsing with quote handling
│   └── logger.py              -- Structured logging for sync runs
├── requirements.txt           -- Python dependencies
└── tests/
    ├── __init__.py
    ├── test_csv_parser.py
    ├── test_coordinate.py
    ├── test_normalizer.py
    ├── test_matcher.py
    ├── test_localdata.py
    ├── test_hira_pharmacy.py
    ├── test_cdn_json.py
    └── fixtures/
        ├── sample_localdata.csv       -- 10-row EUC-KR sample
        ├── sample_animal.csv          -- 5-row EUC-KR sample
        ├── sample_hira_response.xml   -- Single-page HIRA XML
        ├── sample_nmc_response.xml    -- Single-page NMC XML
        └── sample_staff.xlsx          -- 10-row staff XLSX
.github/
└── workflows/
    └── sync-daily.yml         -- GitHub Actions cron workflow
```

---

### Task 1: Project Setup + Dependencies

**Files:**
- Create: `scripts/requirements.txt`
- Create: `scripts/utils/__init__.py`
- Create: `scripts/sources/__init__.py`
- Create: `scripts/transform/__init__.py`
- Create: `scripts/load/__init__.py`
- Create: `scripts/tests/__init__.py`
- Create: `scripts/tests/fixtures/` (directory)

- [ ] **Step 1: Create requirements.txt**

```
pyproj>=3.6.0
openpyxl>=3.1.0
supabase>=2.0.0
requests>=2.31.0
```

- [ ] **Step 2: Create empty __init__.py files for all packages**

Create empty files:
- `scripts/utils/__init__.py`
- `scripts/sources/__init__.py`
- `scripts/transform/__init__.py`
- `scripts/load/__init__.py`
- `scripts/tests/__init__.py`

- [ ] **Step 3: Create fixtures directory**

```bash
mkdir -p scripts/tests/fixtures
```

- [ ] **Step 4: Install dependencies locally and verify**

```bash
cd scripts && pip install -r requirements.txt
python -c "import pyproj; import openpyxl; import supabase; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/requirements.txt scripts/utils/ scripts/sources/ scripts/transform/ scripts/load/ scripts/tests/
git commit -m "chore: sync pipeline project structure and dependencies"
```

---

### Task 2: EUC-KR CSV Parser

**Files:**
- Create: `scripts/utils/csv_parser.py`
- Create: `scripts/tests/test_csv_parser.py`
- Create: `scripts/tests/fixtures/sample_localdata.csv` (EUC-KR encoded)

- [ ] **Step 1: Create test fixture — sample_localdata.csv**

Generate a 3-row EUC-KR CSV matching LOCALDATA format:

```python
# Run this once to create the fixture
import csv, io

header = [
    "번호","개방서비스명","개방서비스아이디","개방자치단체코드","관리번호",
    "인허가일자","인허가취소일자","영업상태구분코드","영업상태명",
    "상세영업상태코드","상세영업상태명","폐업일자","휴업시작일자","휴업종료일자",
    "재개업일자","소재지전화","소재지면적","소재지우편번호","소재지전체주소",
    "도로명전체주소","도로명우편번호","사업장명","최종수정시점","데이터갱신구분",
    "데이터갱신일자","업태구분명","좌표정보x(epsg5174)","좌표정보y(epsg5174)",
    "약국영업면적","지정일자",""
]
rows = [
    ["1","약국","01_01_06_P","3020000","PHMD120001","2020-01-01","","01","영업/정상",
     "13","영업중","","","","","02-1234-5678","","","서울특별시 강남구 역삼동 123",
     "서울특별시 강남구 테헤란로 10","06100","테스트약국","2024-01-01 00:00:00","I",
     "2024-01-01 23:59:59","","198236.123","451234.567","30","20200101",""],
    ["2","약국","01_01_06_P","3020000","PHMD120002","2019-05-15","","03","폐업",
     "","","2023-12-31","","","","","","","서울특별시 강남구 역삼동 456",
     "","","폐업약국","2023-12-31 00:00:00","I","2024-01-01 23:59:59","","","","20","20190515",""],
    ["3","약국","01_01_06_P","3620000","PHMD120003","2021-03-10","","01","영업/정상",
     "13","영업중","","","","","062-555-1234","","","광주광역시 북구 두암동 100",
     "광주광역시 북구 군왕로 50","61197","한방약국","2024-06-01 00:00:00","I",
     "2024-06-01 23:59:59","","193786.830","185954.519","25","20210310",""],
]

buf = io.StringIO()
writer = csv.writer(buf)
writer.writerow(header)
writer.writerows(rows)

with open("scripts/tests/fixtures/sample_localdata.csv", "wb") as f:
    f.write(buf.getvalue().encode("euc-kr"))
```

- [ ] **Step 2: Write failing test**

```python
# scripts/tests/test_csv_parser.py
import os
import pytest
from utils.csv_parser import parse_localdata_csv

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

def test_parse_localdata_csv_returns_active_pharmacies():
    path = os.path.join(FIXTURE_DIR, "sample_localdata.csv")
    rows = parse_localdata_csv(path)
    # Should filter out 폐업 (row 2), keep 영업/정상 (rows 1, 3)
    assert len(rows) == 2

def test_parse_localdata_csv_field_extraction():
    path = os.path.join(FIXTURE_DIR, "sample_localdata.csv")
    rows = parse_localdata_csv(path)
    first = rows[0]
    assert first["id"] == "PHMD120001"
    assert first["name"] == "테스트약국"
    assert first["phone"] == "02-1234-5678"
    assert first["address"] == "서울특별시 강남구 역삼동 123"
    assert first["road_address"] == "서울특별시 강남구 테헤란로 10"
    assert first["business_status_code"] == "01"
    assert first["x_5174"] == 198236.123
    assert first["y_5174"] == 451234.567

def test_parse_localdata_csv_missing_coords():
    path = os.path.join(FIXTURE_DIR, "sample_localdata.csv")
    rows = parse_localdata_csv(path)
    # Row 3 has coords
    third = rows[1]
    assert third["x_5174"] == 193786.830
    assert third["y_5174"] == 185954.519
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd scripts && python -m pytest tests/test_csv_parser.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'utils.csv_parser'`

- [ ] **Step 4: Implement csv_parser.py**

```python
# scripts/utils/csv_parser.py
import csv
from typing import list


def parse_localdata_csv(path: str, encoding: str = "euc-kr") -> list[dict]:
    """Parse LOCALDATA pharmacy CSV. Returns only 영업/정상 (code 01) rows."""
    results = []
    with open(path, encoding=encoding, errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("영업상태구분코드", "").strip() != "01":
                continue

            x_raw = row.get("좌표정보x(epsg5174)", "").strip()
            y_raw = row.get("좌표정보y(epsg5174)", "").strip()

            results.append({
                "id": row.get("관리번호", "").strip(),
                "name": row.get("사업장명", "").strip(),
                "address": row.get("소재지전체주소", "").strip(),
                "road_address": row.get("도로명전체주소", "").strip(),
                "phone": row.get("소재지전화", "").strip(),
                "open_date": row.get("인허가일자", "").strip(),
                "business_status_code": row.get("영업상태구분코드", "").strip(),
                "business_status": row.get("영업상태명", "").strip(),
                "x_5174": float(x_raw) if x_raw else None,
                "y_5174": float(y_raw) if y_raw else None,
            })
    return results


def parse_animal_csv(path: str, encoding: str = "euc-kr") -> list[dict]:
    """Parse LOCALDATA animal pharmacy CSV. Returns only 영업/정상 rows."""
    results = []
    with open(path, encoding=encoding, errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("영업상태구분코드", "").strip() != "01":
                continue

            x_raw = row.get("좌표정보x(epsg5174)", "").strip()
            y_raw = row.get("좌표정보y(epsg5174)", "").strip()

            results.append({
                "id": row.get("관리번호", "").strip(),
                "name": row.get("사업장명", "").strip(),
                "address": row.get("소재지전체주소", "").strip(),
                "road_address": row.get("도로명전체주소", "").strip(),
                "phone": row.get("소재지전화", "").strip(),
                "x_5174": float(x_raw) if x_raw else None,
                "y_5174": float(y_raw) if y_raw else None,
            })
    return results
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd scripts && python -m pytest tests/test_csv_parser.py -v
```

Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add scripts/utils/csv_parser.py scripts/tests/test_csv_parser.py scripts/tests/fixtures/sample_localdata.csv
git commit -m "feat: EUC-KR CSV parser for LOCALDATA pharmacy/animal data"
```

---

### Task 3: Coordinate Conversion (EPSG:5174 → WGS84)

**Files:**
- Create: `scripts/transform/coordinate.py`
- Create: `scripts/tests/test_coordinate.py`

- [ ] **Step 1: Write failing test**

```python
# scripts/tests/test_coordinate.py
import pytest
from transform.coordinate import convert_5174_to_wgs84, convert_batch


def test_convert_known_point():
    # 광주 북구 (from actual LOCALDATA data)
    lon, lat = convert_5174_to_wgs84(193786.830, 185954.519)
    # Expected approximately: lon ~126.9, lat ~35.1
    assert 126.8 < lon < 127.0
    assert 35.0 < lat < 35.2


def test_convert_seoul_point():
    # 서울 강남 approximate
    lon, lat = convert_5174_to_wgs84(198236.123, 451234.567)
    # Should be in Seoul range
    assert 126.5 < lon < 127.5
    assert 37.0 < lat < 38.0


def test_convert_batch():
    records = [
        {"name": "A", "x_5174": 193786.830, "y_5174": 185954.519},
        {"name": "B", "x_5174": None, "y_5174": None},
        {"name": "C", "x_5174": 198236.123, "y_5174": 451234.567},
    ]
    result = convert_batch(records)
    assert result[0]["longitude"] is not None
    assert result[0]["latitude"] is not None
    assert result[1]["longitude"] is None
    assert result[1]["latitude"] is None
    assert result[2]["longitude"] is not None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest tests/test_coordinate.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement coordinate.py**

```python
# scripts/transform/coordinate.py
from pyproj import Transformer

_transformer = Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)


def convert_5174_to_wgs84(x: float, y: float) -> tuple[float, float]:
    """Convert EPSG:5174 (Bessel TM Korea Central) to WGS84 (lon, lat)."""
    lon, lat = _transformer.transform(x, y)
    return round(lon, 7), round(lat, 7)


def convert_batch(records: list[dict]) -> list[dict]:
    """Add longitude/latitude fields to records that have x_5174/y_5174."""
    for r in records:
        x, y = r.get("x_5174"), r.get("y_5174")
        if x is not None and y is not None:
            lon, lat = convert_5174_to_wgs84(x, y)
            r["longitude"] = lon
            r["latitude"] = lat
        else:
            r["longitude"] = None
            r["latitude"] = None
    return records
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scripts && python -m pytest tests/test_coordinate.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/transform/coordinate.py scripts/tests/test_coordinate.py
git commit -m "feat: EPSG:5174 to WGS84 coordinate conversion"
```

---

### Task 4: Name/Address Normalizer

**Files:**
- Create: `scripts/transform/normalizer.py`
- Create: `scripts/tests/test_normalizer.py`

- [ ] **Step 1: Write failing test**

```python
# scripts/tests/test_normalizer.py
from transform.normalizer import normalize_name, normalize_address, extract_sido_sigungu


def test_normalize_name_strips_whitespace_and_parens():
    assert normalize_name("  (새)지곡백화점약국  ") == "지곡백화점약국"
    assert normalize_name("1(일)약국") == "1약국"


def test_normalize_name_removes_common_suffixes():
    # "약국" suffix stays — it's part of the name
    assert normalize_name("테스트약국") == "테스트약국"


def test_normalize_address_simplifies():
    addr = "서울특별시 강남구 테헤란로 10, 1층 (역삼동)"
    result = normalize_address(addr)
    # Should remove parenthetical, comma-after content
    assert "역삼동" not in result
    assert "1층" not in result
    assert "서울특별시" in result


def test_extract_sido_sigungu():
    sido, sigungu = extract_sido_sigungu("서울특별시 강남구 테헤란로 10")
    assert sido == "서울"
    assert sigungu == "강남구"

    sido2, sigungu2 = extract_sido_sigungu("경기도 수원시 팔달구 중부대로 93")
    assert sido2 == "경기"
    assert sigungu2 == "수원팔달구"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest tests/test_normalizer.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement normalizer.py**

```python
# scripts/transform/normalizer.py
import re

# 시도 약칭 매핑 (HIRA uses short names like "서울", "경기")
_SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
    "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기",
    "강원특별자치도": "강원", "강원도": "강원",
    "충청북도": "충북", "충청남도": "충남",
    "전북특별자치도": "전북", "전라북도": "전북",
    "전라남도": "전남", "경상북도": "경북", "경상남도": "경남",
    "제주특별자치도": "제주",
}

# 시군구 결합 패턴 (HIRA: "수원팔달구" = "수원시"+"팔달구")
_SIGUNGU_MERGE = re.compile(r"^(.+[시군])\s+(.+[구])$")


def normalize_name(name: str) -> str:
    """Remove parenthetical prefixes, extra whitespace."""
    name = name.strip()
    name = re.sub(r"\([^)]*\)", "", name)  # remove (xxx)
    name = re.sub(r"\s+", "", name)  # collapse whitespace
    return name


def normalize_address(address: str) -> str:
    """Simplify address: remove parenthetical, comma-after content."""
    addr = address.strip()
    addr = re.sub(r"\(.*?\)", "", addr)  # remove (동이름)
    addr = re.sub(r",.*$", "", addr)  # remove after comma
    addr = addr.strip()
    return addr


def extract_sido_sigungu(address: str) -> tuple[str, str]:
    """Extract (sido_short, sigungu) from full address string."""
    parts = address.strip().split()
    if len(parts) < 2:
        return ("", "")

    sido_full = parts[0]
    sido = _SIDO_SHORT.get(sido_full, sido_full)

    sigungu_raw = parts[1] if len(parts) > 1 else ""
    # Check for compound sigungu: "수원시 팔달구" → "수원팔달구"
    if len(parts) > 2:
        combined = sigungu_raw + " " + parts[2]
        m = _SIGUNGU_MERGE.match(combined)
        if m:
            sigungu_raw = m.group(1).replace("시", "").replace("군", "") + m.group(2)

    return (sido, sigungu_raw)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scripts && python -m pytest tests/test_normalizer.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/transform/normalizer.py scripts/tests/test_normalizer.py
git commit -m "feat: name/address normalizer for cross-source matching"
```

---

### Task 5: Cross-Source Matcher

**Files:**
- Create: `scripts/transform/matcher.py`
- Create: `scripts/tests/test_matcher.py`

- [ ] **Step 1: Write failing test**

```python
# scripts/tests/test_matcher.py
from transform.matcher import match_localdata_to_hira, match_to_animal, classify_herbal


def test_exact_name_address_match():
    localdata = [
        {"id": "L1", "name": "테스트약국", "address": "서울특별시 강남구 역삼동 123",
         "road_address": "서울특별시 강남구 테헤란로 10", "longitude": 127.0, "latitude": 37.5},
    ]
    hira = [
        {"ykiho": "YK001", "name": "테스트약국", "address": "서울특별시 강남구 테헤란로 10, (역삼동)",
         "sido": "서울", "sigungu": "강남구", "longitude": 127.0, "latitude": 37.5},
    ]
    matched, unmatched = match_localdata_to_hira(localdata, hira)
    assert len(matched) == 1
    assert matched[0]["ykiho"] == "YK001"
    assert len(unmatched) == 0


def test_unmatched_flagged():
    localdata = [
        {"id": "L2", "name": "한방전문약국", "address": "서울특별시 종로구 관철동 50",
         "road_address": "", "longitude": 126.9, "latitude": 37.5},
    ]
    hira = []  # No HIRA data
    matched, unmatched = match_localdata_to_hira(localdata, hira)
    assert len(matched) == 0
    assert len(unmatched) == 1
    assert unmatched[0]["has_ykiho"] is False


def test_match_to_animal():
    pharmacies = [
        {"id": "L1", "name": "우리약국", "address": "서울특별시 강남구 역삼동 123",
         "longitude": 127.0, "latitude": 37.5},
    ]
    animals = [
        {"id": "A1", "name": "우리약국", "address": "서울특별시 강남구 역삼동 123",
         "longitude": 127.0, "latitude": 37.5},
    ]
    result, unmatched_animals = match_to_animal(pharmacies, animals)
    assert result[0]["is_animal_pharmacy"] is True
    assert len(unmatched_animals) == 0


def test_classify_herbal():
    pharmacies = [
        {"id": "L1", "ykiho": "YK001", "name": "예담한약국"},
        {"id": "L2", "ykiho": "YK002", "name": "일반약국"},
        {"id": "L3", "ykiho": None, "name": "한방약국"},
    ]
    staff = {
        "YK001": {"pharmacist": 0, "herbal_pharmacist": 1},
        "YK002": {"pharmacist": 2, "herbal_pharmacist": 1},
    }
    result = classify_herbal(pharmacies, staff)
    # YK001: herbal only → is_herbal, not cross_employed
    assert result[0]["is_herbal_pharmacy"] is True
    assert result[0]["is_cross_employed"] is False
    # YK002: both → cross_employed
    assert result[1]["is_herbal_pharmacy"] is True
    assert result[1]["is_cross_employed"] is True
    # L3: no ykiho, no staff data → not herbal (can't confirm)
    assert result[2]["is_herbal_pharmacy"] is False
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest tests/test_matcher.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement matcher.py**

```python
# scripts/transform/matcher.py
import math
from transform.normalizer import normalize_name, normalize_address


def _dice_similarity(a: str, b: str) -> float:
    """Dice coefficient between two strings (bigram-based)."""
    if not a or not b:
        return 0.0
    a_bigrams = set(a[i:i+2] for i in range(len(a)-1))
    b_bigrams = set(b[i:i+2] for i in range(len(b)-1))
    if not a_bigrams or not b_bigrams:
        return 0.0
    return 2 * len(a_bigrams & b_bigrams) / (len(a_bigrams) + len(b_bigrams))


def _distance_m(lon1, lat1, lon2, lat2):
    """Approximate distance in meters between two WGS84 points."""
    if None in (lon1, lat1, lon2, lat2):
        return float("inf")
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(a))


def match_localdata_to_hira(
    localdata: list[dict], hira: list[dict]
) -> tuple[list[dict], list[dict]]:
    """Match LOCALDATA pharmacies to HIRA records. Returns (matched, unmatched)."""
    # Build HIRA lookup by normalized name
    hira_by_name: dict[str, list[dict]] = {}
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
            # Priority 1: exact name + high address similarity
            score = addr_sim
            # Bonus for close proximity
            if dist < 50:
                score += 0.3
            elif dist < 200:
                score += 0.1

            if score > best_score:
                best_score = score
                best_match = h

        if best_match and best_score >= 0.3:
            merged = {**ld, "ykiho": best_match["ykiho"], "has_ykiho": True}
            # Prefer HIRA coordinates (WGS84, more accurate)
            if best_match.get("longitude") and best_match.get("latitude"):
                merged["longitude"] = best_match["longitude"]
                merged["latitude"] = best_match["latitude"]
            matched.append(merged)
        else:
            unmatched.append({**ld, "ykiho": None, "has_ykiho": False})

    return matched, unmatched


def match_to_animal(
    pharmacies: list[dict], animals: list[dict]
) -> tuple[list[dict], list[dict]]:
    """Flag pharmacies that are also animal pharmacies. Returns (updated pharmacies, unmatched animals)."""
    pharm_by_name: dict[str, list[dict]] = {}
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


def classify_herbal(
    pharmacies: list[dict], staff: dict[str, dict]
) -> list[dict]:
    """Classify herbal/cross-employed based on staff info.

    staff format: {ykiho: {"pharmacist": N, "herbal_pharmacist": M}}
    COVID-19 note: HIRA-matched pharmacies with herbal_pharmacist only
    are classified as herbal (한약사 단독 개국), even if they have ykiho.
    """
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scripts && python -m pytest tests/test_matcher.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/transform/matcher.py scripts/tests/test_matcher.py
git commit -m "feat: cross-source matching logic (LOCALDATA ↔ HIRA ↔ animal + herbal classification)"
```

---

### Task 6: LOCALDATA Source Fetcher

**Files:**
- Create: `scripts/sources/localdata.py`
- Create: `scripts/tests/test_localdata.py`

- [ ] **Step 1: Write failing test**

```python
# scripts/tests/test_localdata.py
import os
import tempfile
import zipfile
import pytest
from sources.localdata import download_and_parse_pharmacy, download_and_parse_animal

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def test_download_and_parse_pharmacy_from_local_zip(tmp_path):
    """Test parsing from a local ZIP file (simulates download)."""
    csv_path = os.path.join(FIXTURE_DIR, "sample_localdata.csv")
    zip_path = tmp_path / "test.zip"

    # Create a ZIP containing the CSV with EUC-KR filename
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.write(csv_path, "fulldata_01_01_06_P_약국.csv".encode("euc-kr").decode("cp437", errors="replace"))

    rows = download_and_parse_pharmacy(local_zip_path=str(zip_path))
    assert len(rows) == 2  # Only 영업/정상
    assert rows[0]["name"] == "테스트약국"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest tests/test_localdata.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement localdata.py**

```python
# scripts/sources/localdata.py
import os
import tempfile
import zipfile
import requests
from utils.csv_parser import parse_localdata_csv, parse_animal_csv

PHARMACY_URL = "https://www.localdata.go.kr/datafile/each/01_01_06_P_CSV.zip"
ANIMAL_URL = "https://www.localdata.go.kr/datafile/each/02_03_02_P_CSV.zip"


def _download_zip(url: str, dest: str) -> str:
    """Download a ZIP file to dest path."""
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    with open(dest, "wb") as f:
        f.write(resp.content)
    return dest


def _extract_csv_from_zip(zip_path: str, tmp_dir: str) -> str:
    """Extract the single CSV from a LOCALDATA ZIP, handling EUC-KR filenames."""
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            data = zf.read(info.filename)
            csv_path = os.path.join(tmp_dir, "extracted.csv")
            with open(csv_path, "wb") as f:
                f.write(data)
            return csv_path
    raise FileNotFoundError("No file found in ZIP")


def download_and_parse_pharmacy(local_zip_path: str = None) -> list[dict]:
    """Download LOCALDATA pharmacy ZIP, extract, parse. Returns active pharmacies."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        if local_zip_path:
            zip_path = local_zip_path
        else:
            zip_path = os.path.join(tmp_dir, "pharmacy.zip")
            _download_zip(PHARMACY_URL, zip_path)

        csv_path = _extract_csv_from_zip(zip_path, tmp_dir)
        return parse_localdata_csv(csv_path)


def download_and_parse_animal(local_zip_path: str = None) -> list[dict]:
    """Download LOCALDATA animal pharmacy ZIP, extract, parse."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        if local_zip_path:
            zip_path = local_zip_path
        else:
            zip_path = os.path.join(tmp_dir, "animal.zip")
            _download_zip(ANIMAL_URL, zip_path)

        csv_path = _extract_csv_from_zip(zip_path, tmp_dir)
        return parse_animal_csv(csv_path)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scripts && python -m pytest tests/test_localdata.py -v
```

Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/sources/localdata.py scripts/tests/test_localdata.py
git commit -m "feat: LOCALDATA pharmacy/animal CSV downloader and parser"
```

---

### Task 7: HIRA Pharmacy API Fetcher

**Files:**
- Create: `scripts/sources/hira_pharmacy.py`
- Create: `scripts/tests/test_hira_pharmacy.py`
- Create: `scripts/tests/fixtures/sample_hira_response.xml`

- [ ] **Step 1: Create test fixture**

```xml
<!-- scripts/tests/fixtures/sample_hira_response.xml -->
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE.</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <addr>서울특별시 강남구 테헤란로 10, (역삼동)</addr>
        <clCd>81</clCd>
        <clCdNm>약국</clCdNm>
        <emdongNm>역삼동</emdongNm>
        <estbDd>20200101</estbDd>
        <postNo>06100</postNo>
        <sgguCd>110001</sgguCd>
        <sgguCdNm>강남구</sgguCdNm>
        <sidoCd>110000</sidoCd>
        <sidoCdNm>서울</sidoCdNm>
        <telno>02-1234-5678</telno>
        <XPos>127.0312</XPos>
        <YPos>37.4998</YPos>
        <yadmNm>테스트약국</yadmNm>
        <ykiho>TESTYKIHO001</ykiho>
      </item>
    </items>
    <numOfRows>1</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>1</totalCount>
  </body>
</response>
```

- [ ] **Step 2: Write failing test**

```python
# scripts/tests/test_hira_pharmacy.py
import os
from sources.hira_pharmacy import parse_hira_xml

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def test_parse_hira_xml():
    xml_path = os.path.join(FIXTURE_DIR, "sample_hira_response.xml")
    with open(xml_path) as f:
        xml_text = f.read()

    items, total_count = parse_hira_xml(xml_text)
    assert total_count == 1
    assert len(items) == 1
    item = items[0]
    assert item["ykiho"] == "TESTYKIHO001"
    assert item["name"] == "테스트약국"
    assert item["longitude"] == 127.0312
    assert item["latitude"] == 37.4998
    assert item["sido"] == "서울"
    assert item["sigungu"] == "강남구"
    assert item["phone"] == "02-1234-5678"
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd scripts && python -m pytest tests/test_hira_pharmacy.py -v
```

Expected: FAIL

- [ ] **Step 4: Implement hira_pharmacy.py**

```python
# scripts/sources/hira_pharmacy.py
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


def parse_hira_xml(xml_text: str) -> tuple[list[dict], int]:
    """Parse HIRA pharmacy API XML response. Returns (items, total_count)."""
    root = ET.fromstring(xml_text)

    result_code = root.findtext(".//resultCode", "")
    if result_code != "00":
        raise ValueError(f"HIRA API error: {root.findtext('.//resultMsg', 'unknown')}")

    total_count = int(root.findtext(".//totalCount", "0"))
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

    return items, total_count


def fetch_all_hira_pharmacies(api_key: str, page_size: int = 100, delay: float = 0.5) -> list[dict]:
    """Fetch all pharmacies from HIRA API with pagination."""
    encoded_key = urllib.parse.quote(api_key, safe="")
    base_url = "https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList"

    all_items = []
    page = 1

    while True:
        url = f"{base_url}?ServiceKey={encoded_key}&pageNo={page}&numOfRows={page_size}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=60) as resp:
            xml_text = resp.read().decode("utf-8")

        items, total_count = parse_hira_xml(xml_text)
        all_items.extend(items)

        print(f"  HIRA page {page}: {len(all_items)}/{total_count}")

        if len(all_items) >= total_count:
            break
        page += 1
        time.sleep(delay)

    return all_items
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd scripts && python -m pytest tests/test_hira_pharmacy.py -v
```

Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add scripts/sources/hira_pharmacy.py scripts/tests/test_hira_pharmacy.py scripts/tests/fixtures/sample_hira_response.xml
git commit -m "feat: HIRA pharmacy API fetcher with XML parsing"
```

---

### Task 8: 국립중앙의료원 Operating Hours Fetcher

**Files:**
- Create: `scripts/sources/nmc_pharmacy.py`
- Create: `scripts/tests/fixtures/sample_nmc_response.xml`

- [ ] **Step 1: Create test fixture and implement**

```xml
<!-- scripts/tests/fixtures/sample_nmc_response.xml -->
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE.</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <dutyAddr>서울특별시 강남구 테헤란로 10 (역삼동)</dutyAddr>
        <dutyName>테스트약국</dutyName>
        <dutyTel1>02-1234-5678</dutyTel1>
        <dutyTime1c>2000</dutyTime1c>
        <dutyTime1s>0900</dutyTime1s>
        <dutyTime2c>2000</dutyTime2c>
        <dutyTime2s>0900</dutyTime2s>
        <dutyTime3c>2000</dutyTime3c>
        <dutyTime3s>0900</dutyTime3s>
        <dutyTime4c>2000</dutyTime4c>
        <dutyTime4s>0900</dutyTime4s>
        <dutyTime5c>2000</dutyTime5c>
        <dutyTime5s>0900</dutyTime5s>
        <dutyTime6c>1600</dutyTime6c>
        <dutyTime6s>0900</dutyTime6s>
        <hpid>C1109587</hpid>
        <rnum>1</rnum>
        <wgs84Lat>37.4998</wgs84Lat>
        <wgs84Lon>127.0312</wgs84Lon>
      </item>
    </items>
    <numOfRows>1</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>1</totalCount>
  </body>
</response>
```

- [ ] **Step 2: Implement nmc_pharmacy.py**

```python
# scripts/sources/nmc_pharmacy.py
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


def _format_hours(start: str, close: str) -> str | None:
    """Format 'HHMM' pair to 'HH:MM-HH:MM'. Returns None if empty."""
    if not start or not close:
        return None
    return f"{start[:2]}:{start[2:]}-{close[:2]}:{close[2:]}"


def parse_nmc_xml(xml_text: str) -> tuple[list[dict], int]:
    """Parse 국립중앙의료원 pharmacy API XML response."""
    root = ET.fromstring(xml_text)

    result_code = root.findtext(".//resultCode", "")
    if result_code != "00":
        raise ValueError(f"NMC API error: {root.findtext('.//resultMsg', 'unknown')}")

    total_count = int(root.findtext(".//totalCount", "0"))
    items = []

    for item in root.findall(".//item"):
        lat = item.findtext("wgs84Lat", "")
        lon = item.findtext("wgs84Lon", "")
        items.append({
            "hpid": item.findtext("hpid", ""),
            "name": item.findtext("dutyName", "").strip(),
            "address": item.findtext("dutyAddr", "").strip(),
            "phone": item.findtext("dutyTel1", ""),
            "longitude": float(lon) if lon else None,
            "latitude": float(lat) if lat else None,
            "hours_mon": _format_hours(item.findtext("dutyTime1s", ""), item.findtext("dutyTime1c", "")),
            "hours_tue": _format_hours(item.findtext("dutyTime2s", ""), item.findtext("dutyTime2c", "")),
            "hours_wed": _format_hours(item.findtext("dutyTime3s", ""), item.findtext("dutyTime3c", "")),
            "hours_thu": _format_hours(item.findtext("dutyTime4s", ""), item.findtext("dutyTime4c", "")),
            "hours_fri": _format_hours(item.findtext("dutyTime5s", ""), item.findtext("dutyTime5c", "")),
            "hours_sat": _format_hours(item.findtext("dutyTime6s", ""), item.findtext("dutyTime6c", "")),
            "hours_sun": _format_hours(item.findtext("dutyTime7s", ""), item.findtext("dutyTime7c", "")),
            "hours_hol": _format_hours(item.findtext("dutyTime8s", ""), item.findtext("dutyTime8c", "")),
        })

    return items, total_count


def fetch_all_nmc_pharmacies(api_key: str, page_size: int = 100, delay: float = 0.3) -> list[dict]:
    """Fetch all pharmacies with operating hours from 국립중앙의료원 API."""
    encoded_key = urllib.parse.quote(api_key, safe="")
    base_url = "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire"

    all_items = []
    page = 1

    while True:
        url = f"{base_url}?ServiceKey={encoded_key}&pageNo={page}&numOfRows={page_size}"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=60) as resp:
                xml_text = resp.read().decode("utf-8")
            items, total_count = parse_nmc_xml(xml_text)
            all_items.extend(items)
            print(f"  NMC page {page}: {len(all_items)}/{total_count}")
            if len(all_items) >= total_count:
                break
        except Exception as e:
            print(f"  NMC page {page} failed: {e}, skipping")
            break

        page += 1
        time.sleep(delay)

    return all_items
```

- [ ] **Step 3: Commit**

```bash
git add scripts/sources/nmc_pharmacy.py scripts/tests/fixtures/sample_nmc_response.xml
git commit -m "feat: 국립중앙의료원 pharmacy API fetcher (operating hours)"
```

---

### Task 9: HIRA Staff File Parser

**Files:**
- Create: `scripts/sources/hira_staff.py`
- Create: `scripts/tests/fixtures/sample_staff.xlsx`

- [ ] **Step 1: Create test fixture and implement**

Generate a small XLSX fixture:

```python
# Run once to create fixture
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws.append(["암호화요양기호", "요양기관명", "기타인력코드", "기타인력코드명", "기타인력수"])
ws.append(["YK001", "테스트약국", "071", "약사", 2])
ws.append(["YK001", "테스트약국", "072", "한약사", 1])
ws.append(["YK002", "일반약국", "071", "약사", 1])
ws.append(["YK003", "병원", "200", "사회복지사", 3])  # non-pharmacy staff, should be excluded
wb.save("scripts/tests/fixtures/sample_staff.xlsx")
```

- [ ] **Step 2: Implement hira_staff.py**

```python
# scripts/sources/hira_staff.py
import openpyxl


def parse_staff_xlsx(path: str) -> dict[str, dict]:
    """Parse HIRA quarterly staff XLSX. Returns {ykiho: {pharmacist: N, herbal_pharmacist: M}}.

    Filters to staff_type_code 071 (약사) and 072 (한약사) only.
    """
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    result: dict[str, dict] = {}

    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        if not row or len(row) < 5:
            continue
        ykiho = str(row[0] or "").strip()
        code = str(row[2] or "").strip()
        count = int(row[4] or 0)

        if not ykiho or code not in ("071", "072"):
            continue

        if ykiho not in result:
            result[ykiho] = {"pharmacist": 0, "herbal_pharmacist": 0}

        if code == "071":
            result[ykiho]["pharmacist"] += count
        elif code == "072":
            result[ykiho]["herbal_pharmacist"] += count

    wb.close()
    return result
```

- [ ] **Step 3: Quick inline test**

```bash
cd scripts && python -c "
from sources.hira_staff import parse_staff_xlsx
result = parse_staff_xlsx('tests/fixtures/sample_staff.xlsx')
assert result['YK001'] == {'pharmacist': 2, 'herbal_pharmacist': 1}
assert result['YK002'] == {'pharmacist': 1, 'herbal_pharmacist': 0}
assert 'YK003' not in result  # non-pharmacy staff excluded
print('OK')
"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add scripts/sources/hira_staff.py scripts/tests/fixtures/sample_staff.xlsx
git commit -m "feat: HIRA quarterly staff XLSX parser"
```

---

### Task 10: CDN JSON Generator

**Files:**
- Create: `scripts/load/cdn_json.py`
- Create: `scripts/tests/test_cdn_json.py`

- [ ] **Step 1: Write failing test**

```python
# scripts/tests/test_cdn_json.py
import json
import os
from load.cdn_json import generate_markers_json


def test_generate_markers_json(tmp_path):
    pharmacies = [
        {
            "id": "L1", "name": "테스트약국", "longitude": 127.0, "latitude": 37.5,
            "is_herbal_pharmacy": False, "is_animal_pharmacy": True,
            "is_cross_employed": False, "has_ykiho": True,
            "sido": "서울", "sigungu": "강남구", "phone": "02-1234-5678",
        },
        {
            "id": "L2", "name": "한방약국", "longitude": 126.9, "latitude": 37.4,
            "is_herbal_pharmacy": True, "is_animal_pharmacy": False,
            "is_cross_employed": False, "has_ykiho": False,
            "sido": "서울", "sigungu": "종로구", "phone": "",
        },
    ]

    out_path = str(tmp_path / "markers.json")
    generate_markers_json(pharmacies, out_path)

    with open(out_path) as f:
        data = json.load(f)

    assert data["count"] == 2
    assert "generated_at" in data
    assert len(data["pharmacies"]) == 2

    first = data["pharmacies"][0]
    assert first["id"] == "L1"
    assert first["n"] == "테스트약국"
    assert first["lng"] == 127.0
    assert first["lat"] == 37.5
    assert first["a"] is True   # is_animal
    assert first["h"] is False  # is_herbal
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scripts && python -m pytest tests/test_cdn_json.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement cdn_json.py**

```python
# scripts/load/cdn_json.py
import json
from datetime import datetime, timezone


def generate_markers_json(pharmacies: list[dict], output_path: str) -> str:
    """Generate compact markers.json for CDN serving.

    Uses abbreviated keys to minimize file size:
    n=name, lng/lat=coordinates, h=herbal, a=animal, c=cross, y=ykiho, s=sido, g=sigungu, p=phone
    """
    markers = []
    for p in pharmacies:
        if p.get("longitude") is None or p.get("latitude") is None:
            continue
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
        })

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(markers),
        "pharmacies": markers,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    return output_path
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scripts && python -m pytest tests/test_cdn_json.py -v
```

Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/load/cdn_json.py scripts/tests/test_cdn_json.py
git commit -m "feat: CDN JSON generator for map markers"
```

---

### Task 11: Supabase Loader

**Files:**
- Create: `scripts/load/supabase_loader.py`

- [ ] **Step 1: Implement supabase_loader.py**

```python
# scripts/load/supabase_loader.py
import os
from datetime import datetime, timezone
from supabase import create_client


def get_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def upsert_pharmacies(client, pharmacies: list[dict], batch_size: int = 500) -> int:
    """Upsert pharmacy records to Supabase. Returns count of upserted rows."""
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
    """Upsert staff info to pharmacy_staff table."""
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
        client.table("pharmacy_staff").upsert(
            rows, on_conflict="ykiho,staff_type_code"
        ).execute()

    return len(rows)


def update_freshness(client, source: str, data_date: str, record_count: int, notes: str = ""):
    """Update data_freshness metadata."""
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
    """Log sync run to sync_log table."""
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/load/supabase_loader.py
git commit -m "feat: Supabase loader (upsert pharmacies, staff, freshness, sync log)"
```

---

### Task 12: Logger Utility

**Files:**
- Create: `scripts/utils/logger.py`

- [ ] **Step 1: Implement logger.py**

```python
# scripts/utils/logger.py
import logging
import sys


def setup_logger(name: str = "sync") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        ))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger
```

- [ ] **Step 2: Commit**

```bash
git add scripts/utils/logger.py
git commit -m "feat: sync logger utility"
```

---

### Task 13: Daily Sync Orchestrator

**Files:**
- Create: `scripts/sync_daily.py`

- [ ] **Step 1: Implement sync_daily.py**

```python
#!/usr/bin/env python3
"""Daily pharmacy data sync orchestrator.

Fetches data from 4 sources, merges, and upserts to Supabase.
Generates static markers.json for CDN.
"""
import os
import sys
from datetime import datetime, timezone

# Add scripts dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.logger import setup_logger
from sources.localdata import download_and_parse_pharmacy, download_and_parse_animal
from sources.hira_pharmacy import fetch_all_hira_pharmacies
from sources.nmc_pharmacy import fetch_all_nmc_pharmacies
from sources.hira_staff import parse_staff_xlsx
from transform.coordinate import convert_batch
from transform.matcher import match_localdata_to_hira, match_to_animal, classify_herbal
from transform.normalizer import normalize_name, normalize_address, extract_sido_sigungu
from load.supabase_loader import (
    get_client, upsert_pharmacies, upsert_staff,
    update_freshness, log_sync
)
from load.cdn_json import generate_markers_json

log = setup_logger()


def _attach_operating_hours(pharmacies: list[dict], nmc_data: list[dict]):
    """Match NMC data to pharmacies by name+proximity, attach operating hours."""
    nmc_by_name: dict[str, list[dict]] = {}
    for n in nmc_data:
        key = normalize_name(n["name"])
        nmc_by_name.setdefault(key, []).append(n)

    matched = 0
    for p in pharmacies:
        p_name = normalize_name(p["name"])
        candidates = nmc_by_name.get(p_name, [])
        for c in candidates:
            # Simple coordinate proximity check
            if (p.get("longitude") and c.get("longitude") and
                abs(p["longitude"] - c["longitude"]) < 0.002 and
                abs(p["latitude"] - c["latitude"]) < 0.002):
                for key in ("hours_mon", "hours_tue", "hours_wed", "hours_thu",
                           "hours_fri", "hours_sat", "hours_sun", "hours_hol"):
                    p[key] = c.get(key)
                p["nmc_id"] = c.get("hpid")
                matched += 1
                break

    log.info(f"Operating hours matched: {matched}/{len(pharmacies)}")


def main():
    started_at = datetime.now(timezone.utc).isoformat()
    api_key = os.environ.get("DRUG_API_KEY", "")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    errors = []

    log.info("=== Daily Pharmacy Sync Started ===")

    # Step 1: LOCALDATA
    log.info("Step 1: Downloading LOCALDATA CSVs...")
    localdata_pharmacies = download_and_parse_pharmacy()
    log.info(f"  Pharmacies (active): {len(localdata_pharmacies)}")
    localdata_animals = download_and_parse_animal()
    log.info(f"  Animal pharmacies (active): {len(localdata_animals)}")

    # Convert coordinates
    log.info("  Converting EPSG:5174 → WGS84...")
    convert_batch(localdata_pharmacies)
    convert_batch(localdata_animals)

    # Extract sido/sigungu from address
    for p in localdata_pharmacies:
        sido, sigungu = extract_sido_sigungu(p.get("road_address") or p.get("address", ""))
        p["sido"] = sido
        p["sigungu"] = sigungu

    # Step 2: HIRA Pharmacy API
    log.info("Step 2: Fetching HIRA pharmacy API...")
    try:
        hira_pharmacies = fetch_all_hira_pharmacies(api_key)
        log.info(f"  HIRA pharmacies: {len(hira_pharmacies)}")
    except Exception as e:
        log.error(f"  HIRA API failed: {e}")
        hira_pharmacies = []
        errors.append(f"HIRA: {e}")

    # Step 3: NMC API (operating hours)
    log.info("Step 3: Fetching 국립중앙의료원 API (operating hours)...")
    try:
        nmc_data = fetch_all_nmc_pharmacies(api_key)
        log.info(f"  NMC pharmacies: {len(nmc_data)}")
    except Exception as e:
        log.warning(f"  NMC API failed (non-critical): {e}")
        nmc_data = []
        errors.append(f"NMC: {e}")

    # Step 4: Match & merge
    log.info("Step 4: Matching sources...")
    matched, unmatched = match_localdata_to_hira(localdata_pharmacies, hira_pharmacies)
    log.info(f"  LOCALDATA↔HIRA matched: {len(matched)}, unmatched: {len(unmatched)}")

    all_pharmacies = matched + unmatched

    # Animal matching
    all_pharmacies, unmatched_animals = match_to_animal(all_pharmacies, localdata_animals)
    animal_count = sum(1 for p in all_pharmacies if p.get("is_animal_pharmacy"))
    log.info(f"  Animal pharmacies matched: {animal_count}, unmatched: {len(unmatched_animals)}")

    # Staff classification (from existing quarterly file if available)
    staff_path = os.environ.get("STAFF_XLSX_PATH", "")
    staff_data = {}
    if staff_path and os.path.exists(staff_path):
        log.info(f"  Loading staff data from {staff_path}")
        staff_data = parse_staff_xlsx(staff_path)

    classify_herbal(all_pharmacies, staff_data)
    herbal_count = sum(1 for p in all_pharmacies if p.get("is_herbal_pharmacy"))
    cross_count = sum(1 for p in all_pharmacies if p.get("is_cross_employed"))
    log.info(f"  Herbal: {herbal_count}, Cross-employed: {cross_count}")

    # Operating hours
    if nmc_data:
        _attach_operating_hours(all_pharmacies, nmc_data)

    # Set source field
    for p in all_pharmacies:
        p["source"] = "both" if p.get("has_ykiho") else "localdata"

    # Step 5: Upsert to Supabase
    log.info("Step 5: Upserting to Supabase...")
    try:
        client = get_client()
        pharmacy_count = upsert_pharmacies(client, all_pharmacies)
        log.info(f"  Upserted {pharmacy_count} pharmacies")

        if staff_data:
            staff_count = upsert_staff(client, staff_data, os.environ.get("STAFF_PERIOD", "unknown"))
            log.info(f"  Upserted {staff_count} staff records")
        else:
            staff_count = 0

        update_freshness(client, "localdata", today, len(localdata_pharmacies))
        update_freshness(client, "hira_pharmacy", today, len(hira_pharmacies))
        if nmc_data:
            update_freshness(client, "nmc_hours", today, len(nmc_data))
        update_freshness(client, "animal_pharmacy", today, len(localdata_animals))

        status = "partial" if errors else "success"
        log_sync(client, "daily", started_at, status,
                 pharmacy_count=pharmacy_count, animal_count=animal_count,
                 staff_count=staff_count, errors=errors if errors else None)
    except Exception as e:
        log.error(f"  Supabase upsert failed: {e}")
        errors.append(f"Supabase: {e}")
        status = "failed"

    # Step 6: Generate CDN JSON
    log.info("Step 6: Generating markers.json...")
    output_path = os.environ.get("MARKERS_JSON_PATH", "/tmp/markers.json")
    generate_markers_json(all_pharmacies, output_path)
    log.info(f"  Written to {output_path}")

    log.info(f"=== Sync complete: {status} ({len(all_pharmacies)} pharmacies) ===")
    if errors:
        log.warning(f"  Errors: {errors}")

    return 0 if status != "failed" else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sync_daily.py
git commit -m "feat: daily sync orchestrator (LOCALDATA + HIRA + NMC → Supabase + CDN JSON)"
```

---

### Task 14: Supabase Schema Setup

**Files:**
- Create: `scripts/schema.sql`

- [ ] **Step 1: Create schema.sql from spec**

Copy the full SQL schema from the design spec (Section 2.1) into `scripts/schema.sql`. This file will be run via Supabase MCP or dashboard.

- [ ] **Step 2: Apply schema to Supabase**

Run via Supabase MCP tool:
```sql
-- Enable PostGIS first
CREATE EXTENSION IF NOT EXISTS postgis;
```

Then execute the full schema from `scripts/schema.sql`.

- [ ] **Step 3: Verify tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected: `animal_pharmacy_extra`, `data_freshness`, `pharmacies`, `pharmacy_staff`, `sync_log`

- [ ] **Step 4: Commit**

```bash
git add scripts/schema.sql
git commit -m "feat: Supabase schema (pharmacies, staff, sync_log, freshness + PostGIS)"
```

---

### Task 15: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/sync-daily.yml`

- [ ] **Step 1: Create workflow file**

```yaml
# .github/workflows/sync-daily.yml
name: Daily Pharmacy Sync

on:
  schedule:
    - cron: '0 3 * * *'  # KST 12:00 (UTC 03:00)
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r scripts/requirements.txt

      - name: Run daily sync
        run: python scripts/sync_daily.py
        env:
          DRUG_API_KEY: ${{ secrets.DRUG_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          MARKERS_JSON_PATH: /tmp/markers.json

      - name: Upload markers.json as artifact
        uses: actions/upload-artifact@v4
        with:
          name: markers-json
          path: /tmp/markers.json
          retention-days: 7
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/sync-daily.yml
git commit -m "ci: daily pharmacy sync GitHub Actions workflow"
```

---

### Task 16: Initial Full Sync (Manual Run)

- [ ] **Step 1: Set environment variables locally**

```bash
export DRUG_API_KEY="your_key_here"
export SUPABASE_URL="your_url_here"
export SUPABASE_SERVICE_KEY="your_service_key_here"
export MARKERS_JSON_PATH="/tmp/markers.json"
```

- [ ] **Step 2: Run initial sync**

```bash
cd scripts && python sync_daily.py
```

Expected output:
```
=== Daily Pharmacy Sync Started ===
Step 1: Downloading LOCALDATA CSVs...
  Pharmacies (active): ~25700
  Animal pharmacies (active): ~13200
  Converting EPSG:5174 → WGS84...
Step 2: Fetching HIRA pharmacy API...
  HIRA pharmacies: ~25689
Step 3: Fetching 국립중앙의료원 API (operating hours)...
  NMC pharmacies: ~25100
Step 4: Matching sources...
  LOCALDATA↔HIRA matched: ~25600
Step 5: Upserting to Supabase...
Step 6: Generating markers.json...
=== Sync complete: success ===
```

- [ ] **Step 3: Verify data in Supabase**

```sql
SELECT count(*) FROM pharmacies;
SELECT count(*) FROM pharmacies WHERE is_herbal_pharmacy = true;
SELECT count(*) FROM pharmacies WHERE is_animal_pharmacy = true;
SELECT count(*) FROM pharmacies WHERE has_ykiho = false;
SELECT * FROM data_freshness;
```

- [ ] **Step 4: Verify markers.json**

```bash
python -c "import json; d=json.load(open('/tmp/markers.json')); print(f'Count: {d[\"count\"]}')"
```

- [ ] **Step 5: Commit any fixes from initial run**

```bash
git add -A scripts/
git commit -m "fix: adjustments from initial full sync run"
```
