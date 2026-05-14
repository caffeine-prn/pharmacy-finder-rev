-- MOIS API source storage and public-read/service-role-write RLS.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.mois_facility_raw (
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
  ON public.mois_facility_raw (source, status_code);
CREATE INDEX IF NOT EXISTS idx_mois_facility_license_date
  ON public.mois_facility_raw (source, license_date);
CREATE INDEX IF NOT EXISTS idx_mois_facility_data_updated_at
  ON public.mois_facility_raw (source, data_updated_at);

ALTER TABLE public.sync_log
  ADD COLUMN IF NOT EXISTS new_pharmacies INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_pharmacies INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS changed_pharmacies INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.pharmacy_changelog (
  id SERIAL PRIMARY KEY,
  pharmacy_id TEXT NOT NULL,
  pharmacy_name TEXT,
  event_type TEXT NOT NULL,
  details JSONB,
  detected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_changelog_detected_at
  ON public.pharmacy_changelog (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_changelog_event_type
  ON public.pharmacy_changelog (event_type);

CREATE OR REPLACE VIEW public.pharmacy_marker_view AS
SELECT
  id,
  name,
  longitude,
  latitude,
  is_herbal_pharmacy,
  is_animal_pharmacy,
  is_cross_employed,
  has_ykiho,
  sido,
  sigungu,
  phone,
  open_date,
  updated_at
FROM public.pharmacies
WHERE business_status = '영업/정상'
  AND longitude IS NOT NULL
  AND latitude IS NOT NULL;

ALTER FUNCTION public.nearby_pharmacies(
  p_longitude double precision,
  p_latitude double precision,
  p_limit integer,
  p_max_distance_m integer
) SET search_path = public, extensions;

ALTER FUNCTION public.get_nearby_pharmacies(
  lng double precision,
  lat double precision,
  radius_m integer,
  exclude_id text,
  max_count integer
) SET search_path = public, extensions;

ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_pharmacy_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_freshness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mois_facility_raw ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pharmacies FROM anon, authenticated;
REVOKE ALL ON public.animal_pharmacy_extra FROM anon, authenticated;
REVOKE ALL ON public.pharmacy_staff FROM anon, authenticated;
REVOKE ALL ON public.sync_log FROM anon, authenticated;
REVOKE ALL ON public.data_freshness FROM anon, authenticated;
REVOKE ALL ON public.pharmacy_changelog FROM anon, authenticated;
REVOKE ALL ON public.mois_facility_raw FROM anon, authenticated;

GRANT SELECT ON public.pharmacies TO anon, authenticated;
GRANT SELECT ON public.animal_pharmacy_extra TO anon, authenticated;
GRANT SELECT ON public.pharmacy_staff TO anon, authenticated;
GRANT SELECT ON public.sync_log TO anon, authenticated;
GRANT SELECT ON public.data_freshness TO anon, authenticated;
GRANT SELECT ON public.pharmacy_changelog TO anon, authenticated;
GRANT SELECT ON public.mois_facility_raw TO anon, authenticated;
GRANT SELECT ON public.pharmacy_marker_view TO anon, authenticated;

DROP POLICY IF EXISTS "public read pharmacies" ON public.pharmacies;
CREATE POLICY "public read pharmacies"
  ON public.pharmacies FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read animal pharmacy extra" ON public.animal_pharmacy_extra;
CREATE POLICY "public read animal pharmacy extra"
  ON public.animal_pharmacy_extra FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read pharmacy staff" ON public.pharmacy_staff;
CREATE POLICY "public read pharmacy staff"
  ON public.pharmacy_staff FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read sync log" ON public.sync_log;
CREATE POLICY "public read sync log"
  ON public.sync_log FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read data freshness" ON public.data_freshness;
CREATE POLICY "public read data freshness"
  ON public.data_freshness FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read pharmacy changelog" ON public.pharmacy_changelog;
CREATE POLICY "public read pharmacy changelog"
  ON public.pharmacy_changelog FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read mois raw" ON public.mois_facility_raw;
CREATE POLICY "public read mois raw"
  ON public.mois_facility_raw FOR SELECT
  TO anon, authenticated
  USING (true);
