"use client";

import { useState } from "react";
import { Flag, PaperPlaneTilt } from "@phosphor-icons/react";
import {
  COMMUNITY_BADGE_OPTIONS,
  EVIDENCE_OPTIONS,
  type BadgeEvidenceType,
  type CommunityBadgeType,
} from "@/lib/badges";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { Pharmacy } from "@/lib/types";

interface CommunityReportFormProps {
  pharmacy: Pharmacy;
}

export function CommunityReportForm({ pharmacy }: CommunityReportFormProps) {
  const [badgeType, setBadgeType] = useState<CommunityBadgeType>("unregistered_herbal_staff");
  const [evidenceType, setEvidenceType] = useState<BadgeEvidenceType>("visit");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitReport(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/pharmacy/${pharmacy.id}/badge-reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          badge_type: badgeType,
          evidence_type: evidenceType,
          description,
          reporter_contact: contact,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "제보 접수에 실패했습니다.");
      trackAnalyticsEvent({
        eventName: "field_report_submit",
        pharmacyId: pharmacy.id,
        metadata: {
          badgeType,
          evidenceType,
          reportId: payload.report?.id,
        },
      });
      setDescription("");
      setContact("");
      setMessage("제보가 접수되었습니다. 관리자 검토 후 공개 여부가 결정됩니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "제보 접수에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submitReport} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-2">
        <Flag size={18} className="mt-0.5 text-zinc-500" />
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">현장 정보 제보</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            공식 인력정보에 잡히지 않는 한약사 근무, 난매 의심, 창고형 약국 등은 관리자 검토 후 참고 배지로만 표시됩니다.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-600">
            제보 유형
            <select
              value={badgeType}
              onChange={(event) => setBadgeType(event.target.value as CommunityBadgeType)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            >
              {COMMUNITY_BADGE_OPTIONS.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            근거 유형
            <select
              value={evidenceType}
              onChange={(event) => setEvidenceType(event.target.value as BadgeEvidenceType)}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            >
              {EVIDENCE_OPTIONS.map((option) => (
                <option key={option.type} value={option.type}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minLength={5}
          maxLength={2000}
          required
          placeholder="무엇을 보았는지, 언제쯤인지, 공식자료와 왜 다르다고 보는지 적어주세요."
          className="min-h-28 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          maxLength={200}
          placeholder="연락처 또는 이메일 (선택)"
          className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PaperPlaneTilt size={16} />
          {loading ? "접수 중" : "제보 접수"}
        </button>
        {message && <p className="text-xs text-emerald-700">{message}</p>}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </form>
  );
}
