-- Preserve staff composition snapshots instead of keeping only the latest
-- pharmacy_staff upsert result.

CREATE TABLE IF NOT EXISTS public.pharmacy_staff_history (
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
  ON public.pharmacy_staff_history (ykiho, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pharmacy_staff_history_staff_type
  ON public.pharmacy_staff_history (staff_type_code, observed_at DESC);

ALTER TABLE public.pharmacy_staff_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_staff_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_pharmacy_staff_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.staff_count IS DISTINCT FROM OLD.staff_count
     OR NEW.staff_type_name IS DISTINCT FROM OLD.staff_type_name
     OR NEW.pharmacy_name IS DISTINCT FROM OLD.pharmacy_name
     OR NEW.data_period IS DISTINCT FROM OLD.data_period THEN
    INSERT INTO public.pharmacy_staff_history (
      ykiho,
      pharmacy_name,
      staff_type_code,
      staff_type_name,
      staff_count,
      data_period,
      observed_at,
      source_updated_at
    ) VALUES (
      NEW.ykiho,
      NEW.pharmacy_name,
      NEW.staff_type_code,
      NEW.staff_type_name,
      COALESCE(NEW.staff_count, 0),
      NEW.data_period,
      COALESCE(NEW.updated_at, now()),
      NEW.updated_at
    )
    ON CONFLICT (ykiho, staff_type_code, staff_count, data_period, source_updated_at) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_pharmacy_staff_history ON public.pharmacy_staff;
CREATE TRIGGER trg_record_pharmacy_staff_history
AFTER INSERT OR UPDATE ON public.pharmacy_staff
FOR EACH ROW
EXECUTE FUNCTION public.record_pharmacy_staff_history();

INSERT INTO public.pharmacy_staff_history (
  ykiho,
  pharmacy_name,
  staff_type_code,
  staff_type_name,
  staff_count,
  data_period,
  observed_at,
  source_updated_at
)
SELECT
  ykiho,
  pharmacy_name,
  staff_type_code,
  staff_type_name,
  COALESCE(staff_count, 0),
  data_period,
  COALESCE(updated_at, now()),
  updated_at
FROM public.pharmacy_staff
WHERE staff_type_code IS NOT NULL
ON CONFLICT (ykiho, staff_type_code, staff_count, data_period, source_updated_at) DO NOTHING;
