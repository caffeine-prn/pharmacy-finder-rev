CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'reviewer',
  status TEXT NOT NULL DEFAULT 'active',
  display_name TEXT,
  invited_by TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (role IN ('owner', 'reviewer', 'viewer')),
  CHECK (status IN ('active', 'disabled')),
  CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email_status
  ON public.admin_users (email, status);
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id_status
  ON public.admin_users (user_id, status)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (char_length(action) BETWEEN 2 AND 120),
  CHECK (char_length(target_type) BETWEEN 2 AND 80),
  CHECK (target_id IS NULL OR char_length(target_id) <= 160)
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_created
  ON public.admin_audit_log (admin_email, created_at DESC)
  WHERE admin_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON public.admin_audit_log (target_type, target_id, created_at DESC)
  WHERE target_id IS NOT NULL;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_users FROM anon, authenticated;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;

DROP POLICY IF EXISTS "admin users are service role only" ON public.admin_users;
CREATE POLICY "admin users are service role only"
  ON public.admin_users FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "admin audit log is service role only" ON public.admin_audit_log;
CREATE POLICY "admin audit log is service role only"
  ON public.admin_audit_log FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
