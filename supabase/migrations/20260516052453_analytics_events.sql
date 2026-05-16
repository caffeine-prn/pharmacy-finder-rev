CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  session_id TEXT,
  pharmacy_id TEXT REFERENCES public.pharmacies(id) ON DELETE SET NULL,
  view_name TEXT,
  path TEXT,
  referrer TEXT,
  device_type TEXT,
  country TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(event_name) BETWEEN 2 AND 80),
  CHECK (session_id IS NULL OR char_length(session_id) <= 120),
  CHECK (view_name IS NULL OR char_length(view_name) <= 40),
  CHECK (path IS NULL OR char_length(path) <= 500),
  CHECK (referrer IS NULL OR char_length(referrer) <= 500),
  CHECK (device_type IS NULL OR char_length(device_type) <= 40),
  CHECK (country IS NULL OR char_length(country) <= 8)
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_pharmacy_created
  ON public.analytics_events (pharmacy_id, created_at DESC)
  WHERE pharmacy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_created
  ON public.analytics_events (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.analytics_events FROM anon, authenticated;

DROP POLICY IF EXISTS "analytics events are service role only" ON public.analytics_events;
CREATE POLICY "analytics events are service role only"
  ON public.analytics_events FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
