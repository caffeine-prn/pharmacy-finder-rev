-- Community/admin badge layer for unofficial pharmacy observations.
-- Official HIRA/MOIS fields remain in pharmacies; these tables store reports
-- and reviewed public assertions separately.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pharmacy_badge_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id TEXT NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  report_status TEXT NOT NULL DEFAULT 'pending',
  evidence_type TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  reporter_contact TEXT,
  reporter_ip_hash TEXT,
  user_agent TEXT,
  admin_note TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (badge_type IN (
    'unregistered_herbal_staff',
    'suspected_discounting',
    'warehouse_style',
    'other'
  )),
  CHECK (report_status IN (
    'pending',
    'reviewing',
    'approved',
    'rejected',
    'needs_more_evidence'
  )),
  CHECK (evidence_type IN (
    'visit',
    'consultation',
    'signage',
    'job_posting',
    'photo',
    'other'
  )),
  CHECK (char_length(description) BETWEEN 5 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_badge_reports_pharmacy
  ON public.pharmacy_badge_reports (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_badge_reports_status
  ON public.pharmacy_badge_reports (report_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_badge_reports_type
  ON public.pharmacy_badge_reports (badge_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_badge_assertions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id TEXT NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  assertion_status TEXT NOT NULL DEFAULT 'published',
  confidence TEXT NOT NULL DEFAULT 'admin_reviewed',
  label TEXT NOT NULL,
  public_note TEXT NOT NULL,
  evidence_summary TEXT,
  report_count INTEGER NOT NULL DEFAULT 0,
  first_reported_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, badge_type),
  CHECK (badge_type IN (
    'unregistered_herbal_staff',
    'suspected_discounting',
    'warehouse_style',
    'other'
  )),
  CHECK (assertion_status IN ('draft', 'published', 'hidden', 'expired')),
  CHECK (confidence IN ('single_report', 'multiple_reports', 'admin_reviewed', 'external_evidence')),
  CHECK (char_length(label) BETWEEN 2 AND 80),
  CHECK (char_length(public_note) BETWEEN 5 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_badge_assertions_public
  ON public.pharmacy_badge_assertions (pharmacy_id, badge_type)
  WHERE assertion_status = 'published';
CREATE INDEX IF NOT EXISTS idx_pharmacy_badge_assertions_type
  ON public.pharmacy_badge_assertions (badge_type, assertion_status);

ALTER TABLE public.pharmacy_badge_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_badge_assertions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pharmacy_badge_reports FROM anon, authenticated;
REVOKE ALL ON public.pharmacy_badge_assertions FROM anon, authenticated;

GRANT SELECT ON public.pharmacy_badge_assertions TO anon, authenticated;

DROP POLICY IF EXISTS "public read published badge assertions" ON public.pharmacy_badge_assertions;
CREATE POLICY "public read published badge assertions"
  ON public.pharmacy_badge_assertions FOR SELECT
  TO anon, authenticated
  USING (
    assertion_status = 'published'
    AND (expires_at IS NULL OR expires_at > now())
  );
