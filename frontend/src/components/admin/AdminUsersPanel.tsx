"use client";

import { useState } from "react";
import Link from "next/link";
import { LegacyAdminTokenInput } from "@/components/admin/LegacyAdminTokenInput";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { formatKstDateTime } from "@/lib/datetime";

type AdminUserRow = {
  id: string;
  user_id: string | null;
  email: string;
  role: "owner" | "reviewer" | "viewer";
  status: "active" | "disabled";
  display_name: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

const ROLE_LABELS = {
  owner: "owner",
  reviewer: "reviewer",
  viewer: "viewer",
};

export function AdminUsersPanel() {
  const [token, setToken] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [emailToAdd, setEmailToAdd] = useState("");
  const [roleToAdd, setRoleToAdd] = useState<AdminUserRow["role"]>("reviewer");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { loading: sessionLoading, email, authHeaders } = useAdminSession();

  function adminHeaders(contentType = false) {
    const headers: Record<string, string> = {
      ...authHeaders(),
    };
    if (token) headers["x-admin-token"] = token;
    if (contentType) headers["Content-Type"] = "application/json";
    return headers;
  }

  async function loadUsers() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/admin/users", {
      headers: adminHeaders(),
      cache: "no-store",
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error || "관리자 목록을 불러오지 못했습니다.");
      return;
    }
    setUsers(payload.users || []);
  }

  async function addUser() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: adminHeaders(true),
      body: JSON.stringify({ email: emailToAdd, role: roleToAdd, status: "active" }),
    });
    const payload = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(payload.error || "관리자를 추가하지 못했습니다.");
      return;
    }
    setEmailToAdd("");
    setUsers((items) => [payload.user, ...items.filter((item) => item.id !== payload.user.id)]);
    setMessage("관리자 이메일을 등록했습니다. 해당 사용자는 이메일 OTP로 로그인하면 됩니다.");
  }

  async function updateUser(user: AdminUserRow, patch: Partial<Pick<AdminUserRow, "role" | "status">>) {
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: adminHeaders(true),
      body: JSON.stringify(patch),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "관리자 정보를 변경하지 못했습니다.");
      return;
    }
    setUsers((items) => items.map((item) => (item.id === user.id ? payload.user : item)));
    setMessage("관리자 정보를 변경했습니다.");
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">관리자 계정</h1>
            <p className="mt-2 text-sm text-zinc-500">
              이메일 OTP로 접근할 운영자를 등록하고 역할을 조정합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {email ? (
              <>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  {email}
                </span>
                <Link href="/admin/logout" className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                  로그아웃
                </Link>
              </>
            ) : (
              <Link href="/admin/login?next=/admin/users" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
                이메일 로그인
              </Link>
            )}
            <Link href="/admin/badges" className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              제보 관리자
            </Link>
            <Link href="/admin/analytics" className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              이용 분석
            </Link>
          </div>
        </div>

        <div className="mb-5 space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
            <input
              value={emailToAdd}
              onChange={(event) => setEmailToAdd(event.target.value)}
              placeholder="admin@example.com"
              className="h-10 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-400"
            />
            <select
              value={roleToAdd}
              onChange={(event) => setRoleToAdd(event.target.value as AdminUserRow["role"])}
              className="h-10 rounded-lg border border-zinc-200 px-3 text-sm outline-none"
            >
              <option value="owner">owner</option>
              <option value="reviewer">reviewer</option>
              <option value="viewer">viewer</option>
            </select>
            <button
              onClick={addUser}
              disabled={saving || sessionLoading || (!email && !token)}
              className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "저장 중" : "등록"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadUsers}
              disabled={loading || sessionLoading || (!email && !token)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 disabled:opacity-50"
            >
              {loading ? "불러오는 중" : "목록 조회"}
            </button>
          </div>
          {!email && <LegacyAdminTokenInput token={token} setToken={setToken} />}
        </div>

        {message && <p className="mb-4 text-sm text-zinc-600">{message}</p>}

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">이메일</th>
                  <th className="px-3 py-2 text-left font-medium">역할</th>
                  <th className="px-3 py-2 text-left font-medium">상태</th>
                  <th className="px-3 py-2 text-left font-medium">최근 접근</th>
                  <th className="px-3 py-2 text-left font-medium">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-zinc-900">{user.email}</p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-400">{user.user_id ? "auth 연결됨" : "OTP 첫 로그인 전"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={user.role}
                        onChange={(event) => updateUser(user, { role: event.target.value as AdminUserRow["role"] })}
                        className="h-9 rounded-lg border border-zinc-200 px-2 text-sm"
                      >
                        {Object.keys(ROLE_LABELS).map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={user.status}
                        onChange={(event) => updateUser(user, { status: event.target.value as AdminUserRow["status"] })}
                        className="h-9 rounded-lg border border-zinc-200 px-2 text-sm"
                      >
                        <option value="active">active</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">
                      {user.last_seen_at ? formatKstDateTime(user.last_seen_at) : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => updateUser(user, { status: user.status === "active" ? "disabled" : "active" })}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600"
                      >
                        {user.status === "active" ? "비활성화" : "활성화"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!users.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">
                      목록 조회 후 관리자 계정이 표시됩니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
