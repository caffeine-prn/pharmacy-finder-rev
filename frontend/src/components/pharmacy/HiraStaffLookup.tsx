"use client";

import { useState } from "react";
import { ArrowClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import type { Pharmacy } from "@/lib/types";

interface HiraStaffLookupProps {
  pharmacy: Pharmacy;
}

type LookupRow = {
  ykiho: string;
  pharmacy_name: string;
  staff_type_code: string;
  staff_type_name: string;
  staff_count: number;
};

type LookupResult = {
  fetched_at: string;
  total_count: number;
  pharmacist_count: number;
  herbal_pharmacist_count: number;
  rows: LookupRow[];
};

export function HiraStaffLookup({ pharmacy }: HiraStaffLookupProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!pharmacy.has_ykiho || !pharmacy.ykiho) return null;

  async function refreshStaff() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/pharmacy/${pharmacy.id}/staff`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "인력 조회에 실패했습니다.");
      }

      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "인력 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">HIRA 인력 내역 조회</h3>
          <p className="text-xs text-zinc-500 mt-1">
            요양기관번호로 최신 기타인력 정보를 조회하고 저장합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshStaff}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
        >
          <ArrowClockwise size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "조회 중" : "조회"}
        </button>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle size={15} weight="fill" />
            <span>
              {new Date(result.fetched_at).toLocaleString("ko-KR")} 기준 저장 완료
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-zinc-50 px-3 py-2">
              <p className="text-xs text-zinc-500">약사</p>
              <p className="font-mono text-xl font-bold text-zinc-900">
                {result.pharmacist_count}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 px-3 py-2">
              <p className="text-xs text-zinc-500">한약사</p>
              <p className="font-mono text-xl font-bold text-rose-600">
                {result.herbal_pharmacist_count}
              </p>
            </div>
          </div>
          {result.rows.length > 0 ? (
            <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-100">
              {result.rows.map((row) => (
                <div
                  key={`${row.staff_type_code}-${row.staff_type_name}`}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="text-zinc-700">
                    {row.staff_type_name || row.staff_type_code}
                  </span>
                  <span className="font-mono font-semibold text-zinc-900">
                    {row.staff_count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              반환된 인력 내역이 없습니다.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <WarningCircle size={15} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
