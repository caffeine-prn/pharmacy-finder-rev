"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EnvelopeSimple, SignIn } from "@phosphor-icons/react";
import { createAuthBrowserSupabase } from "@/lib/supabase/client";

export function AdminLoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(searchParams.get("error"));
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createAuthBrowserSupabase();
    const origin = window.location.origin;
    const next = searchParams.get("next") || "/admin/badges";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${origin}/admin/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) {
      setMessage(error.message || "로그인 메일 발송에 실패했습니다.");
      return;
    }
    setSent(true);
    setMessage("메일로 보낸 로그인 링크를 열어주세요.");
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <SignIn size={20} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">관리자 로그인</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            등록된 관리자 이메일로 일회용 로그인 링크를 받습니다.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700">
            이메일
            <div className="mt-1 flex h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 focus-within:border-emerald-400">
              <EnvelopeSimple size={17} className="text-zinc-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={loading || sent}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "발송 중" : sent ? "메일 발송됨" : "로그인 링크 받기"}
          </button>
        </form>
        {message && (
          <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${sent ? "bg-emerald-50 text-emerald-700" : "bg-zinc-50 text-zinc-600"}`}>
            {message}
          </p>
        )}
        <p className="mt-5 text-xs leading-5 text-zinc-400">
          접근 권한은 Supabase `admin_users` 테이블에 등록된 이메일 기준으로 확인합니다.
        </p>
      </div>
    </div>
  );
}
