-- HIRA pharmacy opening/closing/suspension event source storage.

CREATE TABLE IF NOT EXISTS public.hira_opclo_raw (
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
  ON public.hira_opclo_raw (event_date);
CREATE INDEX IF NOT EXISTS idx_hira_opclo_event_type
  ON public.hira_opclo_raw (event_type);

ALTER TABLE public.hira_opclo_raw ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hira_opclo_raw FROM anon, authenticated;
GRANT SELECT ON public.hira_opclo_raw TO anon, authenticated;

DROP POLICY IF EXISTS "public read hira opclo raw" ON public.hira_opclo_raw;
CREATE POLICY "public read hira opclo raw"
  ON public.hira_opclo_raw FOR SELECT
  TO anon, authenticated
  USING (true);
