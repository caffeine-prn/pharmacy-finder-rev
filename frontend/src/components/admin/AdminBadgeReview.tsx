"use client";

import { useState } from "react";
import Link from "next/link";
import { badgeTypeLabel } from "@/lib/badges";
import type { PharmacyBadgeReport } from "@/lib/types";

const STATUS_OPTIONS = [
  ["pending", "대기"],
  ["reviewing", "검토중"],
  ["approved", "승인"],
  ["rejected", "반려"],
  ["needs_more_evidence", "추가근거"],
] as const;

export function AdminBadgeReview() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("pending");
  const [reports, setReports] = useState<PharmacyBadgeReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/admin/badge-reports?status=${status}`, {
      headers: { "x-admin-token": token },
      cache: "no-store",
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error || "불러오기에 실패했습니다.");
      return;
    }
    setReports(payload.reports || []);
  }

  async function updateReport(report: PharmacyBadgeReport, nextStatus: string) {
    const response = await fetch(`/api/admin/badge-reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ report_status: nextStatus, reviewed_by: "admin" }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "상태 변경에 실패했습니다.");
      return;
    }
    setReports((items) => items.filter((item) => item.id !== report.id));
    setMessage("검토 상태를 변경했습니다.");
  }

  async function publishAssertion(report: PharmacyBadgeReport) {
    const response = await fetch("/api/admin/badge-assertions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({
        pharmacy_id: report.pharmacy_id,
        badge_type: report.badge_type,
        label: badgeTypeLabel(report.badge_type),
        public_note:
          "공식 HIRA 인력정보와 별개로, 현장 제보가 관리자 검토를 거쳐 표시된 항목입니다.",
        evidence_summary: report.description.slice(0, 500),
        report_count: 1,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "공개 배지 생성에 실패했습니다.");
      return;
    }
    await updateReport(report, "approved");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-900">커뮤니티 배지 관리자</h1>
          <Link href="/admin/analytics" className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
            이용 분석
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          공식 자료와 별개인 현장 제보를 검토하고 공개 배지로 전환합니다.
        </p>
      </div>
      <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-white p-3">
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="관리자 토큰"
          type="password"
          className="h-10 min-w-64 rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-400"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-lg border border-zinc-200 px-3 text-sm outline-none"
        >
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button
          onClick={loadReports}
          disabled={loading || !token}
          className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "불러오는 중" : "조회"}
        </button>
      </div>
      {message && <p className="mb-4 text-sm text-zinc-600">{message}</p>}
      <div className="space-y-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {report.pharmacies?.name || report.pharmacy_id}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {report.pharmacies?.road_address || report.pharmacies?.address}
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                {badgeTypeLabel(report.badge_type)}
              </span>
            </div>
            <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
              {report.description}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => publishAssertion(report)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                승인 후 공개
              </button>
              <button onClick={() => updateReport(report, "reviewing")} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600">
                검토중
              </button>
              <button onClick={() => updateReport(report, "needs_more_evidence")} className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600">
                추가근거
              </button>
              <button onClick={() => updateReport(report, "rejected")} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600">
                반려
              </button>
            </div>
          </div>
        ))}
        {!reports.length && (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
            표시할 제보가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
