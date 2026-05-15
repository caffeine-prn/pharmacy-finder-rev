"use client";

import { useEffect, useState } from "react";
import { Info } from "@phosphor-icons/react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatKstDate, formatKstDateTime } from "@/lib/datetime";
import type { DataFreshness } from "@/lib/types";

export function DataFreshnessFooter() {
  const [freshness, setFreshness] = useState<DataFreshness[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    supabase
      .from("data_freshness")
      .select("*")
      .then(({ data }) => {
        if (data) setFreshness(data as DataFreshness[]);
      });
  }, []);

  // Get summary text
  const pharmacyDate =
    freshness.find((f) => f.source === "mois_pharmacy_api")?.data_date ??
    freshness.find((f) => f.source === "localdata")?.data_date;
  const staffFreshness =
    freshness.find((f) => f.source === "hira_staff_lookup_batch") ??
    freshness.find((f) => f.source === "hira_staff_lookup") ??
    freshness.find((f) => f.source === "staff_info") ??
    freshness.find((f) => f.source === "hira_staff");
  const staffDate = staffFreshness?.last_sync
    ? `${formatKstDate(staffFreshness.last_sync)} KST`
    : staffFreshness?.data_date;

  if (!pharmacyDate && !staffDate) return null;

  const summaryText = [
    pharmacyDate && `약국정보 ${pharmacyDate}`,
    staffDate && `인력정보 ${staffDate}`,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[999] pointer-events-none">
      <div className="pointer-events-auto">
        {/* Collapsed bar */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute bottom-2 left-2 flex max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-full border border-zinc-200 bg-white/90 px-3 py-1.5 text-[11px] text-zinc-500 shadow-md backdrop-blur-sm transition-colors hover:text-zinc-700 max-sm:bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] max-sm:right-2 max-sm:justify-center max-sm:truncate max-sm:px-2.5"
        >
          <Info size={12} />
          <span className="truncate">데이터 기준: {summaryText}</span>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="absolute bottom-10 left-2 w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-xl max-sm:bottom-[calc(env(safe-area-inset-bottom)+7rem)] max-sm:right-2 max-sm:w-auto">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-zinc-700">데이터 기준</p>
              <div className="flex items-center gap-2 text-[11px] font-medium">
                <Link href="/about" className="text-zinc-500 hover:text-zinc-800">
                  안내
                </Link>
                <Link href="/log" className="text-emerald-700 hover:text-emerald-900">
                  로그
                </Link>
              </div>
            </div>
            <div className="space-y-1.5">
              {freshness.map((f) => (
                <div key={f.source} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {f.source === "localdata" && "약국 기본정보"}
                    {f.source === "mois_pharmacy_api" && "행안부 약국정보"}
                    {f.source === "hira_pharmacy" && "HIRA 약국정보"}
                    {f.source === "hira_opclo" && "HIRA 개폐업"}
                    {f.source === "nmc_pharmacy" && "영업시간"}
                    {f.source === "nmc_hours" && "영업시간"}
                    {f.source === "hira_staff" && "인력정보"}
                    {f.source === "hira_staff_lookup" && "HIRA 인력조회"}
                    {f.source === "hira_staff_lookup_batch" && "HIRA 인력조회 배치"}
                    {f.source === "staff_info" && "인력정보"}
                    {f.source === "localdata_animal" && "동물약국"}
                    {f.source === "mois_animal_pharmacy_api" && "행안부 동물약국"}
                  </span>
                  <span className="text-xs text-zinc-700 font-mono">
                    {f.source.startsWith("hira_staff_lookup") && f.last_sync
                      ? `${formatKstDate(f.last_sync)} KST`
                      : f.data_date}
                  </span>
                </div>
              ))}
            </div>
            {freshness[0]?.last_sync && (
              <p className="text-[10px] text-zinc-400 mt-2 border-t border-zinc-100 pt-1.5">
                마지막 동기화: {formatKstDateTime(freshness[0].last_sync)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
