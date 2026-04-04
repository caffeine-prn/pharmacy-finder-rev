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
