-- On-demand HIRA staff lookup cache.
-- Writes are performed only by server-side service-role API routes.

CREATE TABLE IF NOT EXISTS public.hira_staff_lookup_raw (
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
  ON public.hira_staff_lookup_raw (ykiho);

ALTER TABLE public.hira_staff_lookup_raw ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hira_staff_lookup_raw FROM anon, authenticated;

