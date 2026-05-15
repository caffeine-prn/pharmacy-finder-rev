-- Display-ready lifecycle fields on the normalized pharmacy table.

ALTER TABLE public.pharmacies
  ADD COLUMN IF NOT EXISTS mois_license_date DATE,
  ADD COLUMN IF NOT EXISTS mois_closed_date DATE,
  ADD COLUMN IF NOT EXISTS mois_detail_status_code TEXT,
  ADD COLUMN IF NOT EXISTS mois_detail_status_name TEXT,
  ADD COLUMN IF NOT EXISTS mois_data_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hira_open_date DATE,
  ADD COLUMN IF NOT EXISTS hira_last_event_type TEXT,
  ADD COLUMN IF NOT EXISTS hira_last_event_date DATE;

CREATE INDEX IF NOT EXISTS idx_pharmacies_mois_license_date
  ON public.pharmacies (mois_license_date);
CREATE INDEX IF NOT EXISTS idx_pharmacies_mois_closed_date
  ON public.pharmacies (mois_closed_date)
  WHERE mois_closed_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacies_hira_last_event_date
  ON public.pharmacies (hira_last_event_date)
  WHERE hira_last_event_date IS NOT NULL;
