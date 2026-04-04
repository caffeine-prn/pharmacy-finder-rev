# Pharmacy Finder: Data Sync + Frontend Redesign

## Overview

전국 약국 찾기 서비스의 데이터 자동 동기화 파이프라인 구축 및 프론트엔드 리디자인.
현재 정적 CSV/JSON 기반 → Supabase DB + Next.js + 자동 동기화 체계로 전환.

---

## 1. Data Sync Pipeline

### 1.1 Data Sources

| Source | Type | Frequency | Auth | Key Data |
|--------|------|-----------|------|----------|
| LOCALDATA 약국 CSV | ZIP download | Daily | None | 전체 약국 (25,766 영업중), 영업상태, EPSG:5174 좌표 |
| LOCALDATA 동물약국 CSV | ZIP download | Daily | None | 동물약국 (13,250 영업중), 영업상태 |
| HIRA 약국정보서비스 API | REST (paginated) | Daily | `DRUG_API_KEY` | ykiho, WGS84 좌표, 주소, 전화, 개설일 |
| 국립중앙의료원 약국조회 API | REST (paginated) | Daily | `DRUG_API_KEY` | 영업시간 (요일별), WGS84 좌표 |
| HIRA 분기 파일 (인력정보) | XLSX in ZIP | Quarterly | Manual/Playwright | 약사/한약사 인원수 (ykiho별) |

### 1.2 API Endpoints

```
LOCALDATA 약국:     https://www.localdata.go.kr/datafile/each/01_01_06_P_CSV.zip
LOCALDATA 동물약국:  https://www.localdata.go.kr/datafile/each/02_03_02_P_CSV.zip
HIRA 약국정보:      https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList
HIRA 인력정보:      https://apis.data.go.kr/B551182/MadmDtlInfoService2.7/getEtcHstInfo2.7
국립중앙의료원 약국조회:       https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire
HIRA 분기파일:      https://opendata.hira.or.kr (DEXT5 download, fileId variable)
```

### 1.3 Sync Strategy

**Daily sync (GitHub Actions, ~35min):**

```
Step 1: Download LOCALDATA CSVs (ZIP, no auth)
  ├─ Parse CSV (EUC-KR encoding)
  ├─ Filter: 영업상태구분코드 = "01" (영업/정상)
  └─ Convert EPSG:5174 → WGS84

Step 2: Fetch HIRA pharmacy API (all pages, ~257 requests)
  ├─ 100 records/page, ~6sec/request
  └─ Extract: ykiho, name, address, phone, coordinates

Step 3: Fetch 국립중앙의료원 pharmacy API (all pages, ~252 requests)
  ├─ 100 records/page, ~2sec/request
  └─ Extract: dutyName, operating hours (dutyTime1s~7c), coordinates

Step 4: Match & merge
  ├─ LOCALDATA ↔ HIRA: match by name + address → attach ykiho
  ├─ HIRA ↔ 국립중앙의료원: match by name + address → attach operating hours
  ├─ LOCALDATA 동물약국 ↔ base pharmacies: match by name + address
  ├─ Unmatched LOCALDATA entries = 요양기관번호 미부여 약국
  └─ Attach staff info from latest quarterly data (ykiho join)

Step 5: Upsert to Supabase
  ├─ pharmacies table (full upsert)
  ├─ animal_pharmacies table
  └─ Log sync metadata (timestamp, counts, errors)

Step 6: Generate static JSON for CDN
  ├─ markers.json — 전체 마커 좌표 + 최소 메타 (id, name, lng, lat, flags)
  ├─ markers_chunked/ — 시도별 분할 JSON (필요 시)
  └─ Deploy to Vercel static or Supabase Storage (CDN-backed)
```

**Quarterly (manual or Playwright):**

```
Step 1: Download HIRA 분기 파일 from opendata.hira.or.kr
Step 2: Extract "12.의료기관별상세정보서비스_10_기타인력정보" XLSX
Step 3: Filter: 기타인력코드명 IN ('약사', '한약사')
Step 4: Upsert to pharmacy_staff table
Step 5: Update data_freshness metadata (인력정보 기준일)
```

### 1.4 Coordinate Conversion

LOCALDATA provides EPSG:5174 (Bessel TM Korea Central).
Conversion to WGS84 using pyproj:

```python
from pyproj import Transformer
transformer = Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)
lon, lat = transformer.transform(x_5174, y_5174)
```

486 records (~1.9%) in LOCALDATA lack coordinates.
Fallback: use HIRA coordinates if matched, or geocode from 도로명전체주소.

### 1.5 Matching Logic

LOCALDATA ↔ HIRA matching (no shared key):

```
Priority 1: Exact name match + address substring match
Priority 2: Normalized name (remove spaces, parentheses) + sido/sigungu match
Priority 3: Coordinate proximity (<50m) + name similarity (Dice coefficient)
Unmatched: Flag as 요양기관번호 미부여
```

---

## 2. Database Schema (Supabase Postgres + PostGIS)

### 2.1 Tables

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Main pharmacy table
CREATE TABLE pharmacies (
  id TEXT PRIMARY KEY,                    -- LOCALDATA 관리번호 or HIRA ykiho
  ykiho TEXT UNIQUE,                      -- HIRA 암호화요양기호 (nullable for unmatched)
  name TEXT NOT NULL,
  category TEXT,                          -- 종별코드명 (약국)
  sido TEXT,
  sigungu TEXT,
  address TEXT,
  road_address TEXT,                      -- 도로명전체주소
  phone TEXT,
  open_date DATE,
  location GEOGRAPHY(Point, 4326),        -- PostGIS point (WGS84)
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  business_status TEXT DEFAULT '영업중',   -- 영업중/휴업
  business_status_code TEXT,              -- 01, 02, etc.
  has_ykiho BOOLEAN DEFAULT false,
  is_animal_pharmacy BOOLEAN DEFAULT false,
  is_herbal_pharmacy BOOLEAN DEFAULT false,
  is_cross_employed BOOLEAN DEFAULT false, -- 약사+한약사 교차고용
  pharmacist_count INTEGER DEFAULT 0,
  herbal_pharmacist_count INTEGER DEFAULT 0,
  -- Operating hours (from 국립중앙의료원)
  hours_mon TEXT,    -- "0900-2000"
  hours_tue TEXT,
  hours_wed TEXT,
  hours_thu TEXT,
  hours_fri TEXT,
  hours_sat TEXT,
  hours_sun TEXT,
  hours_hol TEXT,
  -- Metadata
  localdata_id TEXT,                      -- LOCALDATA 관리번호
  nmc_id TEXT,                            -- 국립중앙의료원 hpid
  source TEXT,                            -- 'localdata', 'hira', 'both'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_pharmacies_location ON pharmacies USING GIST (location);
CREATE INDEX idx_pharmacies_sido ON pharmacies (sido);
CREATE INDEX idx_pharmacies_sigungu ON pharmacies (sido, sigungu);
CREATE INDEX idx_pharmacies_name ON pharmacies USING GIN (to_tsvector('simple', name));
CREATE INDEX idx_pharmacies_ykiho ON pharmacies (ykiho) WHERE ykiho IS NOT NULL;
CREATE INDEX idx_pharmacies_animal ON pharmacies (is_animal_pharmacy) WHERE is_animal_pharmacy = true;
CREATE INDEX idx_pharmacies_herbal ON pharmacies (is_herbal_pharmacy) WHERE is_herbal_pharmacy = true;

-- Animal pharmacy details (unmatched ones from LOCALDATA 동물약국)
CREATE TABLE animal_pharmacy_extra (
  id TEXT PRIMARY KEY,                    -- LOCALDATA 동물약국 관리번호
  name TEXT NOT NULL,
  address TEXT,
  road_address TEXT,
  phone TEXT,
  location GEOGRAPHY(Point, 4326),
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  business_status TEXT,
  matched_pharmacy_id TEXT REFERENCES pharmacies(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Staff info (quarterly from HIRA file)
CREATE TABLE pharmacy_staff (
  id SERIAL PRIMARY KEY,
  ykiho TEXT NOT NULL,
  pharmacy_name TEXT,
  staff_type_code TEXT,                   -- 071=약사, 072=한약사
  staff_type_name TEXT,
  staff_count INTEGER,
  data_period TEXT,                        -- "2025.12"
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ykiho, staff_type_code)
);

-- Sync log
CREATE TABLE sync_log (
  id SERIAL PRIMARY KEY,
  sync_type TEXT,                          -- 'daily', 'quarterly'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT,                             -- 'success', 'partial', 'failed'
  pharmacy_count INTEGER,
  animal_count INTEGER,
  staff_count INTEGER,
  errors JSONB,
  metadata JSONB                           -- data freshness dates, source counts
);

-- Data freshness metadata
CREATE TABLE data_freshness (
  source TEXT PRIMARY KEY,
  last_sync TIMESTAMPTZ,
  data_date TEXT,                          -- "2025.12" for quarterly, "2026-04-04" for daily
  record_count INTEGER,
  notes TEXT
);
```

### 2.2 Data Serving Strategy

**지도 마커 데이터: 정적 JSON via CDN (Supabase 호출 안 함)**

동기화 시 생성되는 `markers.json`을 CDN에서 서빙.
프론트엔드는 초기 로드 시 이 JSON만 fetch하여 마커 렌더링.

```
markers.json (~1.5MB, gzipped ~400KB)
{
  "generated_at": "2026-04-04T03:35:00Z",
  "count": 25766,
  "pharmacies": [
    {
      "id": "PHMD1...",
      "n": "OO약국",           // name (축약 키로 용량 절감)
      "lng": 126.921,
      "lat": 37.398,
      "h": true,               // is_herbal_pharmacy
      "a": false,              // is_animal_pharmacy
      "c": false,              // is_cross_employed
      "y": true,               // has_ykiho
      "s": "서울",             // sido
      "g": "강남구",           // sigungu
      "p": "02-123-4567"       // phone
    }
  ]
}
```

저장 위치: Supabase Storage (CDN-backed) 또는 Vercel 정적 파일.

**상세 조회/검색: Supabase 직접 쿼리**

```sql
-- 약국 상세 페이지 (개별 조회)
SELECT p.*, ps_y.staff_count as pharmacist_count_live, ps_h.staff_count as herbal_count_live
FROM pharmacies p
LEFT JOIN pharmacy_staff ps_y ON p.ykiho = ps_y.ykiho AND ps_y.staff_type_code = '071'
LEFT JOIN pharmacy_staff ps_h ON p.ykiho = ps_h.ykiho AND ps_h.staff_type_code = '072'
WHERE p.id = $1;

-- 테이블 뷰 (페이지네이션 + 필터 + 정렬)
SELECT id, name, address, phone, sido, sigungu,
       is_herbal_pharmacy, is_animal_pharmacy, is_cross_employed,
       pharmacist_count, herbal_pharmacist_count, has_ykiho
FROM pharmacies
WHERE business_status = '영업중'
  AND ($1::text IS NULL OR sido = $1)
  AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
ORDER BY $3
LIMIT $4 OFFSET $5;

-- Pharmacy detail page
SELECT p.*, ps_y.staff_count as pharmacist_count_live, ps_h.staff_count as herbal_count_live
FROM pharmacies p
LEFT JOIN pharmacy_staff ps_y ON p.ykiho = ps_y.ykiho AND ps_y.staff_type_code = '071'
LEFT JOIN pharmacy_staff ps_h ON p.ykiho = ps_h.ykiho AND ps_h.staff_type_code = '072'
WHERE p.id = $1;

-- Nearby pharmacies (PostGIS)
SELECT id, name, longitude, latitude,
       ST_Distance(location, ST_MakePoint($1, $2)::geography) as distance_m
FROM pharmacies
WHERE ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3)
  AND business_status = '영업중'
ORDER BY distance_m
LIMIT 20;

-- Search
SELECT * FROM pharmacies
WHERE to_tsvector('simple', name) @@ plainto_tsquery('simple', $1)
  AND business_status = '영업중';
```

---

## 3. Frontend Redesign (Next.js + Leaflet)

### 3.1 Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS v4
- **Map:** Leaflet + react-leaflet + MarkerCluster
- **Fonts:** Pretendard (Korean) + Geist (UI)
- **Icons:** Phosphor Icons
- **Data:** 정적 JSON (CDN) for map markers, Supabase JS client for detail/search/table
- **State:** zustand (minimal global state for filters/map)
- **Motion:** CSS transitions + Framer Motion (selective, for panel transitions)

### 3.2 Design Direction

**Aesthetic: "Utilitarian Precision"**
- Clean, information-dense map interface
- Zinc/Slate neutral base with Emerald accent (pharmacy) + Rose accent (herbal)
- No purple gradients, no generic card layouts
- Map takes 90%+ of viewport, controls overlay as floating panels
- Left-aligned asymmetric layout for sidebars/panels

**Key differentiator:** The map is the hero. Everything else floats on top of it. No chunky headers stealing vertical space.

### 3.3 Page Structure

```
app/
├── layout.tsx              -- Root layout (fonts, metadata)
├── page.tsx                -- Main view (지도/테이블 탭 전환)
├── pharmacy/
│   └── [id]/
│       └── page.tsx        -- Pharmacy detail (SSR, SEO)
├── api/
│   ├── pharmacies/
│   │   └── route.ts        -- Pharmacy list/search/table API (paginated)
│   ├── pharmacy/[id]/
│   │   └── route.ts        -- Single pharmacy API
│   └── kakao-local/
│       └── route.ts        -- Kakao place proxy (migrated)
└── components/
    ├── ViewTabs.tsx         -- 지도/테이블 탭 전환 (client component)
    ├── map/
    │   ├── PharmacyMap.tsx  -- Main map (client component, CDN JSON fetch)
    │   ├── MarkerLayer.tsx  -- Clustered markers
    │   └── MapControls.tsx  -- Zoom, locate, filters
    ├── table/
    │   ├── PharmacyTable.tsx -- 테이블 뷰 (Supabase 페이지네이션)
    │   ├── TableFilters.tsx  -- 시도/시군구/검색/필터 컨트롤
    │   └── TablePagination.tsx
    ├── panels/
    │   ├── SearchPanel.tsx  -- Search + region filter
    │   ├── FilterBar.tsx    -- Toggle filters (herbal, animal, etc.)
    │   ├── PharmacyList.tsx -- Sidebar list
    │   └── PharmacyPopup.tsx-- Map popup content
    ├── pharmacy/
    │   ├── PharmacyDetail.tsx
    │   ├── OperatingHours.tsx
    │   └── StaffInfo.tsx
    └── ui/
        ├── Badge.tsx
        ├── Button.tsx
        └── Skeleton.tsx
```

### 3.4 뷰 전환 (지도 / 테이블)

메인 페이지에서 탭으로 전환. URL 파라미터(`?view=map` / `?view=table`)로 상태 유지.

**공통 UI:**
- 상단: 검색바 + 시도/시군구 드롭다운 + 필터 토글 (한약사/동물약국/교차고용/요양X)
- 탭 전환 시 필터 상태 유지

### 3.5 Map View

**Data flow:**
1. CDN에서 `markers.json` fetch (~400KB gzipped) — Supabase 호출 없음
2. MarkerCluster로 클러스터링
3. 사용자 위치 기반 자동 줌 (geolocation permission)

**Interactions:**
- Floating search bar (top-left, glass effect with subtle border)
- Filter toggles (floating pill bar below search)
- Pharmacy click → slide-in panel (right side, 360px) with detail + 네이버/카카오 링크
- "내 위치" button → nearest pharmacies highlighted
- Dense view toggle (cluster disable with adaptive guard)

### 3.6 Table View

**Data flow:**
- Supabase에서 서버사이드 페이지네이션 (50건/페이지)
- 필터/정렬/검색은 서버에서 처리 (클라이언트에서 25K 정렬하지 않음)

**컬럼:**
| 약국명 | 주소 | 전화번호 | 시��� | 시군구 | 약사 | 한약사 | 구분 |
- 구분: 뱃지로 표시 (동물약국, 한약사, 교차고용, 요양X)
- 행 클릭 → 상세 페이지 이동 또는 지도 뷰 전환+해당 약국 포커스
- CSV/Excel 내보내기 버튼

**정렬:** 약국명, 시도, 시군구, 약사수, 한약사수
**필터:** 지도 뷰와 동일한 ����셋 공유

### 3.7 Data Freshness

- 하단 ��� 또는 info 버튼에 "데이터 기준: 약국정보 2026-04-04 / 인력정보 2025.12" 상시 표시
- `data_freshness` 테이블에서 fetch

### 3.8 Pharmacy Detail Page (`/pharmacy/[id]`)

SSR rendered for SEO. Contains:
- 약국명, 주소, 전화번호
- 영업시간 (요일별, 국립중앙의료원 데이터)
- 인력정보 (약사 N명, 한약사 N명)
- 동물약국 여부
- 교차고용 여부
- 소형 지도 (위치 표시)
- 네이버/카카오 링크
- 신고하기 (Google Forms)
- 주변 약국 목록 (PostGIS proximity query)

### 3.9 Visual Language

**Colors (CSS variables):**
```css
--bg-primary: #fafafa;        /* zinc-50 */
--bg-surface: #ffffff;
--border: #e4e4e7;            /* zinc-200 */
--text-primary: #18181b;      /* zinc-900 */
--text-secondary: #71717a;    /* zinc-500 */
--accent-pharmacy: #059669;   /* emerald-600 */
--accent-herbal: #e11d48;     /* rose-600 */
--accent-animal: #ea580c;     /* orange-600 */
--accent-cross: #7c3aed;      /* violet-600 */
--accent-unknown: #6b7280;    /* gray-500 */
```

**Map markers:**
- Pharmacy: Emerald ring, white fill
- Herbal: Rose ring, herbal icon
- Animal: Orange ring, paw icon
- Cross-employed: Violet badge overlay
- No ykiho: Gray dashed ring

**Typography:**
- Headlines: Pretendard Bold, tracking-tight
- Body: Pretendard Regular
- Mono (data): Geist Mono

---

## 4. GitHub Actions Workflow

### 4.1 Daily Sync

```yaml
name: Daily Pharmacy Sync
on:
  schedule:
    - cron: '0 3 * * *'    # 매일 KST 12:00 (UTC 03:00)
  workflow_dispatch:         # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install pyproj supabase-py openpyxl
      - run: python scripts/sync_daily.py
        env:
          DRUG_API_KEY: ${{ secrets.DRUG_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

### 4.2 Scripts Structure

```
scripts/
├── sync_daily.py           -- Orchestrator for daily sync
├── sources/
│   ├── localdata.py        -- LOCALDATA CSV download + parse
│   ├── hira_pharmacy.py    -- HIRA pharmacy API fetcher
│   ├── nmc_pharmacy.py     -- 국립중앙의료원 operating hours fetcher
│   └── hira_staff.py       -- HIRA quarterly file parser
├── transform/
│   ├── coordinate.py       -- EPSG:5174 → WGS84
│   ├── matcher.py          -- Cross-source matching logic
│   └── normalizer.py       -- Name/address normalization
├── load/
│   ├── supabase_loader.py  -- Upsert to Supabase
│   └── cdn_json.py         -- Generate markers.json + upload to Supabase Storage
└── utils/
    ├── csv_parser.py       -- EUC-KR CSV handling
    └── logger.py           -- Sync logging
```

---

## 5. Migration Plan

### Phase 1: Database + Sync (backend)
1. Create Supabase project + schema
2. Implement sync scripts
3. Run initial full sync
4. Set up GitHub Actions cron
5. Verify daily sync stability

### Phase 2: Frontend Rebuild
1. Initialize Next.js project
2. Map component (Leaflet + CDN JSON fetch)
3. Table view component (Supabase paginated query)
4. View tabs (지도/테이블 전환)
5. Search + filter panels (공유 필터셋)
6. Pharmacy detail page (SSR)
7. Data freshness display

### Phase 3: Cutover
1. Deploy Next.js to Vercel
2. DNS/routing switch
3. Retire old static files
4. Monitor sync + frontend

---

## 6. Data Freshness Display

Frontend must always show data provenance:

```
약국 기본정보  2026-04-04 갱신  (HIRA + LOCALDATA 일일 동기화)
인력정보       2025년 12월 기준  (HIRA 분기 파일)
영업시간       2026-04-04 갱신  (국립중앙의료원)
동물약국       2026-04-04 갱신  (LOCALDATA 일일 동기화)
```

Fetched from `data_freshness` table. Displayed in footer or info panel.
