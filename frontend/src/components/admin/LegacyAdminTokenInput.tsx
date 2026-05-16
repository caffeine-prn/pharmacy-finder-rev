"use client";

interface LegacyAdminTokenInputProps {
  token: string;
  setToken: (token: string) => void;
}

export function LegacyAdminTokenInput({ token, setToken }: LegacyAdminTokenInputProps) {
  return (
    <details className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer font-medium text-zinc-600">
        비상용 토큰으로 접근
      </summary>
      <input
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="관리자 토큰"
        type="password"
        className="mt-3 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-400"
      />
      <p className="mt-2 text-xs text-zinc-400">
        이메일 OTP 전환 중에도 기존 운영 토큰은 백업 경로로 유지됩니다.
      </p>
    </details>
  );
}
