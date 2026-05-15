"use client";

import { CalendarCheck, CalendarPlus, CalendarX, Pulse } from "@phosphor-icons/react";
import type { Pharmacy } from "@/lib/types";

interface LifecycleTimelineProps {
  pharmacy: Pick<
    Pharmacy,
    | "open_date"
    | "business_status"
    | "mois_license_date"
    | "mois_closed_date"
    | "mois_detail_status_name"
    | "mois_data_updated_at"
    | "hira_open_date"
    | "hira_last_event_type"
    | "hira_last_event_date"
  >;
  compact?: boolean;
}

interface TimelineItem {
  source: string;
  label: string;
  date: string | null;
  detail: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
  icon: React.ReactNode;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toneClass(tone: TimelineItem["tone"]) {
  return {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-600",
  }[tone];
}

function eventTone(eventType: string | null | undefined): TimelineItem["tone"] {
  if (eventType === "폐업") return "rose";
  if (eventType === "휴업") return "amber";
  if (eventType === "개업") return "emerald";
  return "zinc";
}

function eventIcon(eventType: string | null | undefined) {
  if (eventType === "폐업") return <CalendarX size={16} />;
  if (eventType === "휴업") return <Pulse size={16} />;
  return <CalendarPlus size={16} />;
}

export function LifecycleTimeline({ pharmacy, compact }: LifecycleTimelineProps) {
  const items: TimelineItem[] = [
    {
      source: "행안부",
      label: "인허가",
      date: pharmacy.mois_license_date || pharmacy.open_date,
      detail: pharmacy.mois_detail_status_name || pharmacy.business_status || "영업상태 확인",
      tone: "emerald",
      icon: <CalendarCheck size={16} />,
    },
    {
      source: "행안부",
      label: "폐업",
      date: pharmacy.mois_closed_date,
      detail: pharmacy.mois_closed_date ? "행안부 폐업일 기록" : "폐업일 기록 없음",
      tone: pharmacy.mois_closed_date ? "rose" : "zinc",
      icon: <CalendarX size={16} />,
    },
    {
      source: "HIRA",
      label: "개설",
      date: pharmacy.hira_open_date,
      detail: pharmacy.hira_open_date ? "요양기관 기본목록 개설일" : "HIRA 개설일 미매칭",
      tone: pharmacy.hira_open_date ? "emerald" : "zinc",
      icon: <CalendarPlus size={16} />,
    },
    {
      source: "HIRA",
      label: pharmacy.hira_last_event_type || "개폐업",
      date: pharmacy.hira_last_event_date,
      detail: pharmacy.hira_last_event_type
        ? `개폐업 API ${pharmacy.hira_last_event_type} 이벤트`
        : "최근 개폐업 이벤트 없음",
      tone: eventTone(pharmacy.hira_last_event_type),
      icon: eventIcon(pharmacy.hira_last_event_type),
    },
  ];
  const updatedAt = formatDateTime(pharmacy.mois_data_updated_at);

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900">개폐업 시계열</h3>
        {updatedAt && <span className="text-[11px] text-zinc-400">행안부 갱신 {updatedAt}</span>}
      </div>
      <div className={compact ? "space-y-2" : "grid gap-2 sm:grid-cols-2"}>
        {items.map((item) => (
          <div key={`${item.source}-${item.label}`} className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${toneClass(item.tone)}`}>
                {item.icon}
                {item.source} {item.label}
              </span>
              <span className="font-mono text-xs font-semibold text-zinc-900">{formatDate(item.date)}</span>
            </div>
            <p className="text-xs leading-5 text-zinc-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
