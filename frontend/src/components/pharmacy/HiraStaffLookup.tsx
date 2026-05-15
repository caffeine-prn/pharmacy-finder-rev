"use client";

import { useEffect, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  ClockClockwise,
  WarningCircle,
} from "@phosphor-icons/react";
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
  fetched_at: string | null;
  total_count: number;
  pharmacist_count: number;
  herbal_pharmacist_count: number;
  can_refresh: boolean;
  can_refresh_at: string | null;
  refreshed: boolean;
  message?: string;
  rows: LookupRow[];
};

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HiraStaffLookup({ pharmacy }: HiraStaffLookupProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(() =>
    pharmacy.hira_staff_fetched_at
      ? {
          fetched_at: pharmacy.hira_staff_fetched_at,
          total_count: pharmacy.hira_staff_total_count || 0,
          pharmacist_count: pharmacy.pharmacist_count || 0,
          herbal_pharmacist_count: pharmacy.herbal_pharmacist_count || 0,
          can_refresh: true,
          can_refresh_at: null,
          refreshed: false,
          rows: [],
        }
      : null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    if (!pharmacy.has_ykiho || !pharmacy.ykiho) return;

    async function loadCachedStaff() {
      try {
        const response = await fetch(`/api/pharmacy/${pharmacy.id}/staff`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) return;
        if (!ignore) setResult(payload);
      } catch {
        // Cached lookup is informational; leave the panel usable even if it fails.
      }
    }

    loadCachedStaff();
    return () => {
      ignore = true;
    };
  }, [pharmacy.has_ykiho, pharmacy.id, pharmacy.ykiho]);

  if (
    !pharmacy.has_ykiho &&
    !pharmacy.pharmacist_count &&
    !pharmacy.herbal_pharmacist_count
  ) {
    return null;
  }

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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "인력 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const canRefresh = result?.can_refresh ?? true;
  const pharmacistCount = result?.pharmacist_count ?? pharmacy.pharmacist_count ?? 0;
  const herbalPharmacistCount =
    result?.herbal_pharmacist_count ?? pharmacy.herbal_pharmacist_count ?? 0;
  const fetchedAt = result?.fetched_at || pharmacy.hira_staff_fetched_at;
  const basis = fetchedAt
    ? `기준: HIRA API 조회, ${formatDateTime(fetchedAt)}`
    : "기준: CSV/기본 데이터";

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900">인력 구성</h3>
          <p className="text-xs text-zinc-500 mt-1">
            {basis}
          </p>
          {!pharmacy.ykiho && (
            <p className="mt-2 text-xs text-zinc-400">
              요양기관번호가 없어 HIRA API 직접 조회는 사용할 수 없습니다.
            </p>
          )}
        </div>
        {pharmacy.has_ykiho && pharmacy.ykiho && (
          <button
            type="button"
            onClick={refreshStaff}
            disabled={loading || !canRefresh}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowClockwise size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "조회 중" : canRefresh ? "HIRA 확인" : "24시간 후"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {result && (
          <div className="flex items-start gap-2 text-xs text-emerald-700">
            {result.can_refresh ? (
              <CheckCircle size={15} weight="fill" className="mt-0.5 flex-shrink-0" />
            ) : (
              <ClockClockwise size={15} weight="fill" className="mt-0.5 flex-shrink-0" />
            )}
            <span>
              {result.message ||
                (result.fetched_at
                  ? `${formatDateTime(result.fetched_at)} 기준 데이터`
                  : "저장된 인력 조회 내역이 없습니다.")}
            </span>
          </div>
        )}
        {result && !result.can_refresh && result.can_refresh_at && (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            다음 갱신 가능: {formatDateTime(result.can_refresh_at)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-zinc-50 px-3 py-2">
            <p className="text-xs text-zinc-500">약사</p>
            <p className="font-mono text-xl font-bold text-zinc-900">
              {pharmacistCount}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 px-3 py-2">
            <p className="text-xs text-zinc-500">한약사</p>
            <p className="font-mono text-xl font-bold text-rose-600">
              {herbalPharmacistCount}
            </p>
          </div>
        </div>
        {result?.rows.length ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-500">HIRA 원천 반환 항목</p>
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
          </div>
        ) : fetchedAt ? (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            HIRA 원천 항목은 저장된 요약값으로 표시 중입니다.
          </p>
        ) : null}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <WarningCircle size={15} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
