-- Pharmacy Finder: Supabase Schema
-- Run this via Supabase SQL Editor or MCP

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Main pharmacy table
CREATE TABLE IF NOT EXISTS pharmacies (
  id TEXT PRIMARY KEY,
  ykiho TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  sido TEXT,
  sigungu TEXT,
  address TEXT,
  road_address TEXT,
  phone TEXT,
  open_date DATE,
  mois_license_date DATE,
  mois_closed_date DATE,
  mois_detail_status_code TEXT,
  mois_detail_status_name TEXT,
  mois_data_updated_at TIMESTAMPTZ,
  hira_open_date DATE,
  hira_last_event_type TEXT,
  hira_last_event_date DATE,
  hira_staff_fetched_at TIMESTAMPTZ,
  hira_staff_total_count INTEGER,
  location GEOGRAPHY(Point, 4326),
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  business_status TEXT DEFAULT '영업중',
  business_status_code TEXT,
  has_ykiho BOOLEAN DEFAULT false,
  is_animal_pharmacy BOOLEAN DEFAULT false,
  is_herbal_pharmacy BOOLEAN DEFAULT false,
  is_cross_employed BOOLEAN DEFAULT false,
  pharmacist_count INTEGER DEFAULT 0,
  herbal_pharmacist_count INTEGER DEFAULT 0,
  hours_mon TEXT,
  hours_tue TEXT,
  hours_wed TEXT,
  hours_thu TEXT,
  hours_fri TEXT,
  hours_sat TEXT,
  hours_sun TEXT,
  hours_hol TEXT,
  localdata_id TEXT,
  nmc_id TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacies_location ON pharmacies USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_pharmacies_sido ON pharmacies (sido);
CREATE INDEX IF NOT EXISTS idx_pharmacies_sigungu ON pharmacies (sido, sigungu);
CREATE INDEX IF NOT EXISTS idx_pharmacies_name ON pharmacies USING GIN (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_pharmacies_ykiho ON pharmacies (ykiho) WHERE ykiho IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacies_animal ON pharmacies (is_animal_pharmacy) WHERE is_animal_pharmacy = true;
CREATE INDEX IF NOT EXISTS idx_pharmacies_herbal ON pharmacies (is_herbal_pharmacy) WHERE is_herbal_pharmacy = true;

-- Animal pharmacy details (unmatched)
CREATE TABLE IF NOT EXISTS animal_pharmacy_extra (
  id TEXT PRIMARY KEY,
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

-- Staff info (quarterly)
CREATE TABLE IF NOT EXISTS pharmacy_staff (
  id SERIAL PRIMARY KEY,
  ykiho TEXT NOT NULL,
  pharmacy_name TEXT,
  staff_type_code TEXT,
  staff_type_name TEXT,
  staff_count INTEGER,
  data_period TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ykiho, staff_type_code)
);

-- Historical staff snapshots. pharmacy_staff remains the current summary,
-- while this table preserves changes over time for longitudinal analysis.
CREATE TABLE IF NOT EXISTS pharmacy_staff_history (
  id BIGSERIAL PRIMARY KEY,
  ykiho TEXT NOT NULL,
  pharmacy_name TEXT,
  staff_type_code TEXT NOT NULL,
  staff_type_name TEXT,
  staff_count INTEGER NOT NULL DEFAULT 0,
  data_period TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ykiho, staff_type_code, staff_count, data_period, source_updated_at)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_staff_history_ykiho_observed
  ON pharmacy_staff_history (ykiho, observed_at DESC);

-- Sync log
CREATE TABLE IF NOT EXISTS sync_log (
  id SERIAL PRIMARY KEY,
  sync_type TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT,
  pharmacy_count INTEGER,
  animal_count INTEGER,
  staff_count INTEGER,
  errors JSONB,
  metadata JSONB
);

-- Data freshness
CREATE TABLE IF NOT EXISTS data_freshness (
  source TEXT PRIMARY KEY,
  last_sync TIMESTAMPTZ,
  data_date TEXT,
  record_count INTEGER,
  notes TEXT
);

-- MOIS source rows from data.go.kr 1741000 APIs.
-- This table preserves the raw licensing payload separately from the normalized
-- map/search tables so freshness audits and event logs can be rebuilt later.
CREATE TABLE IF NOT EXISTS mois_facility_raw (
  source TEXT NOT NULL,
  mng_no TEXT NOT NULL,
  name TEXT,
  status_code TEXT,
  status_name TEXT,
  detail_status_code TEXT,
  detail_status_name TEXT,
  license_date DATE,
  closed_date DATE,
  data_updated_at TIMESTAMPTZ,
  last_modified_at TIMESTAMPTZ,
  opn_atmy_grp_cd TEXT,
  road_address TEXT,
  lotno_address TEXT,
  phone TEXT,
  x_5174 DOUBLE PRECISION,
  y_5174 DOUBLE PRECISION,
  raw JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (source, mng_no)
);

CREATE INDEX IF NOT EXISTS idx_mois_facility_source_status
  ON mois_facility_raw (source, status_code);
CREATE INDEX IF NOT EXISTS idx_mois_facility_license_date
  ON mois_facility_raw (source, license_date);
CREATE INDEX IF NOT EXISTS idx_mois_facility_data_updated_at
  ON mois_facility_raw (source, data_updated_at);

-- HIRA pharmacy opening/closing/suspension event rows.
-- This complements the HIRA pharmacy baseline list so newly opened pharmacies
-- after the baseline date can still be matched by ykiho.
CREATE TABLE IF NOT EXISTS hira_opclo_raw (
  ykiho TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  name TEXT,
  category TEXT,
  sido TEXT,
  sido_code TEXT,
  address TEXT,
  phone TEXT,
  crtr_ym TEXT,
  raw JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ykiho, event_type, event_date)
);

CREATE INDEX IF NOT EXISTS idx_hira_opclo_event_date
  ON hira_opclo_raw (event_date);
CREATE INDEX IF NOT EXISTS idx_hira_opclo_event_type
  ON hira_opclo_raw (event_type);

-- On-demand HIRA staff lookup cache.
-- Writes are performed only by server-side service-role API routes.
CREATE TABLE IF NOT EXISTS hira_staff_lookup_raw (
  ykiho TEXT NOT NULL,
  staff_type_code TEXT NOT NULL,
  staff_type_name TEXT,
  staff_count INTEGER,
  pharmacy_name TEXT,
  raw JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (ykiho, staff_type_code)
);

CREATE INDEX IF NOT EXISTS idx_hira_staff_lookup_ykiho
  ON hira_staff_lookup_raw (ykiho);
