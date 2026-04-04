"use client";

import { useEffect, useState } from "react";
import { Info } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase/client";
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
  const pharmacyDate = freshness.find((f) => f.source === "localdata")?.data_date;
  const staffDate = freshness.find((f) => f.source === "hira_staff")?.data_date;

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
          className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-md border border-zinc-200 text-[11px] text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          <Info size={12} />
          데이터 기준: {summaryText}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="absolute bottom-10 left-2 bg-white rounded-lg shadow-xl border border-zinc-200 p-3 w-72">
            <p className="text-xs font-semibold text-zinc-700 mb-2">데이터 기준</p>
            <div className="space-y-1.5">
              {freshness.map((f) => (
                <div key={f.source} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">
                    {f.source === "localdata" && "약국 기본정보"}
                    {f.source === "hira_pharmacy" && "HIRA 약국정보"}
                    {f.source === "nmc_pharmacy" && "영업시간"}
                    {f.source === "hira_staff" && "인력정보"}
                    {f.source === "localdata_animal" && "동물약국"}
                  </span>
                  <span className="text-xs text-zinc-700 font-mono">{f.data_date}</span>
                </div>
              ))}
            </div>
            {freshness[0]?.last_sync && (
              <p className="text-[10px] text-zinc-400 mt-2 border-t border-zinc-100 pt-1.5">
                마지막 동기화: {new Date(freshness[0].last_sync).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
