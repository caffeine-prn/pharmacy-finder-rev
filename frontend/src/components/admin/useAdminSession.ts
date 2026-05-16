"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createAuthBrowserSupabase } from "@/lib/supabase/client";

export function useAdminSession() {
  const supabase = useMemo(() => createAuthBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [session?.access_token]);

  return {
    session,
    loading,
    email: session?.user.email || null,
    authHeaders,
  };
}
