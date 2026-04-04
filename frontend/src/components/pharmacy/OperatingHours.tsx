// frontend/src/components/pharmacy/OperatingHours.tsx
"use client";

import { Clock } from "@phosphor-icons/react";
import type { Pharmacy } from "@/lib/types";

interface OperatingHoursProps {
  pharmacy: Pharmacy;
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일", "공휴일"];
const DAY_KEYS: (keyof Pharmacy)[] = [
  "hours_mon",
  "hours_tue",
  "hours_wed",
  "hours_thu",
  "hours_fri",
  "hours_sat",
  "hours_sun",
  "hours_hol",
];

function formatHours(raw: string | null): string {
  if (!raw) return "-";
  // Format "0900-1800" -> "09:00 - 18:00"
  const match = raw.match(/(\d{2})(\d{2})-(\d{2})(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]} - ${match[3]}:${match[4]}`;
  }
  return raw;
}

export function OperatingHours({ pharmacy }: OperatingHoursProps) {
  const hasAnyHours = DAY_KEYS.some((k) => pharmacy[k]);
  if (!hasAnyHours) return null;

  // Determine today's index (0=Mon in our array, JS Sunday=0)
  const jsDay = new Date().getDay(); // 0=Sun
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={18} className="text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-900">영업시간</h3>
      </div>
      <div className="space-y-1.5">
        {DAY_LABELS.map((label, i) => {
          const val = pharmacy[DAY_KEYS[i]] as string | null;
          const isToday = i === todayIdx;
          return (
            <div
              key={label}
              className={`flex items-center justify-between py-1 px-2 rounded ${
                isToday ? "bg-emerald-50" : ""
              }`}
            >
              <span
                className={`text-sm ${
                  isToday ? "font-semibold text-emerald-700" : "text-zinc-500"
                }`}
              >
                {label}
                {isToday && (
                  <span className="ml-1.5 text-[10px] bg-emerald-600 text-white px-1 py-0.5 rounded">
                    오늘
                  </span>
                )}
              </span>
              <span
                className={`text-sm font-mono ${
                  isToday ? "font-semibold text-emerald-700" : "text-zinc-700"
                }`}
              >
                {formatHours(val)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
