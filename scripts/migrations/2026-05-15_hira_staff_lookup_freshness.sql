-- Store the basis timestamp for on-demand HIRA staff lookups.

ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS hira_staff_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hira_staff_total_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_pharmacies_hira_staff_fetched_at
  ON public.pharmacies (hira_staff_fetched_at)
  WHERE hira_staff_fetched_at IS NOT NULL;
