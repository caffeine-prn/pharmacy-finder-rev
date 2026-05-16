"use client";

import { SealCheck, WarningCircle } from "@phosphor-icons/react";
import type { PharmacyBadgeAssertion } from "@/lib/types";
import { formatKstDate } from "@/lib/datetime";

interface CommunityBadgePanelProps {
  assertions: PharmacyBadgeAssertion[];
}

export function CommunityBadgePanel({ assertions }: CommunityBadgePanelProps) {
  if (!assertions.length) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-2">
        <WarningCircle size={18} weight="fill" className="mt-0.5 text-amber-600" />
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">현장 제보 기반 배지</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            공식 HIRA/MOIS 자료와 별개로, 관리자 검토를 거쳐 공개한 참고 정보입니다.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {assertions.map((assertion) => (
          <div
            key={assertion.id}
            className="rounded-lg border border-amber-200 bg-white px-3 py-3"
          >
            <div className="flex items-center gap-2">
              <SealCheck size={16} weight="fill" className="text-amber-600" />
              <span className="text-sm font-semibold text-zinc-900">
                {assertion.label}
              </span>
              <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                {assertion.report_count}건 검토
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              {assertion.public_note}
            </p>
            {assertion.evidence_summary && (
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                근거 요약: {assertion.evidence_summary}
              </p>
            )}
            <p className="mt-2 text-[11px] text-zinc-400">
              관리자 확인일: {formatKstDate(assertion.confirmed_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

