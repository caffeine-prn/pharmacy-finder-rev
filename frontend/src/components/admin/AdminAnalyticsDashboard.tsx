"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ChartBar,
  ClockCounterClockwise,
  DeviceMobile,
  MapPin,
  UsersThree,
} from "@phosphor-icons/react";
import { formatKstDateTime } from "@/lib/datetime";
import { LegacyAdminTokenInput } from "@/components/admin/LegacyAdminTokenInput";
import { useAdminSession } from "@/components/admin/useAdminSession";

type CountEntry = { key: string; count: number };
type PharmacyEntry = CountEntry & {
  pharmacy: { id: string; name: string; sido: string | null; sigungu: string | null } | null;
};
type AnalyticsPayload = {
  days: number;
  totalEvents: number;
  uniqueSessions: number;
  byEvent: CountEntry[];
  byPath: CountEntry[];
  byDevice: CountEntry[];
  byView: CountEntry[];
  byCountry: CountEntry[];
  byDay: Array<{ date: string; count: number }>;
  topPharmacies: PharmacyEntry[];
  recent: Array<{
    event_name: string;
    session_id: string | null;
    pharmacy_id: string | null;
    view_name: string | null;
    path: string | null;
    device_type: string | null;
    country: string | null;
    created_at: string;
  }>;
};

const EVENT_LABELS: Record<string, string> = {
  page_view: "페이지 조회",
  filter_toggle: "필터 토글",
  region_filter: "지역 필터",
  date_filter: "개업일 필터",
  pharmacy_click: "약국 클릭",
  field_report_open: "현장제보 열기",
  field_report_submit: "현장제보 제출",
  hira_staff_lookup_click: "HIRA 인력조회",
  csv_export: "CSV 내보내기",
  view_change: "지도/테이블 전환",
};

function labelEvent(key: string) {
  return EVENT_LABELS[key] || key;
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between text-zinc-400">
        {icon}
      </div>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-zinc-900">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

function CountList({ title, rows, renderKey = (key: string) => key }: { title: string; rows: CountEntry[]; renderKey?: (key: string) => string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      </div>
      <div className="divide-y divide-zinc-100">
        {rows.length ? rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 truncate text-zinc-700">{renderKey(row.key)}</span>
            <span className="font-mono font-semibold text-zinc-900">{row.count.toLocaleString()}</span>
          </div>
        )) : (
          <div className="px-4 py-8 text-center text-sm text-zinc-400">아직 기록이 없습니다.</div>
        )}
      </div>
    </div>
  );
}

export function AdminAnalyticsDashboard() {
  const [token, setToken] = useState("");
  const [days, setDays] = useState("7");
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { loading: sessionLoading, email, authHeaders } = useAdminSession();

  function adminHeaders() {
    const headers: Record<string, string> = {
      ...authHeaders(),
    };
    if (token) headers["x-admin-token"] = token;
    return headers;
  }

  async function loadAnalytics() {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/admin/analytics?days=${days}`, {
      headers: adminHeaders(),
      cache: "no-store",
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error || "분석 데이터를 불러오지 못했습니다.");
      return;
    }
    setData(payload);
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">서비스 이용 분석</h1>
            <p className="mt-2 text-sm text-zinc-500">
              개인 식별정보 없이 익명 세션 기준으로 주요 사용 흐름을 집계합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {email ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                {email}
              </span>
            ) : (
              <Link href="/admin/login?next=/admin/analytics" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
                이메일 로그인
              </Link>
            )}
            <Link href="/admin/badges" className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              제보 관리자
            </Link>
            <Link href="/admin/users" className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              관리자 계정
            </Link>
          </div>
        </div>

        <div className="mb-5 space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
          <div className="flex flex-wrap gap-2">
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="h-10 rounded-lg border border-zinc-200 px-3 text-sm outline-none"
          >
            <option value="1">최근 1일</option>
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="90">최근 90일</option>
          </select>
          <button
            onClick={loadAnalytics}
            disabled={loading || sessionLoading || (!email && !token)}
            className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "불러오는 중" : "조회"}
          </button>
          </div>
          {!email && <LegacyAdminTokenInput token={token} setToken={setToken} />}
        </div>

        {message && <p className="mb-4 text-sm text-rose-600">{message}</p>}

        {data ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={<ChartBar size={20} />} label="이벤트" value={data.totalEvents.toLocaleString()} detail={`최근 ${data.days}일`} />
              <MetricCard icon={<UsersThree size={20} />} label="익명 세션" value={data.uniqueSessions.toLocaleString()} detail="브라우저 로컬 세션 기준" />
              <MetricCard icon={<MapPin size={20} />} label="약국 클릭" value={(data.byEvent.find((row) => row.key === "pharmacy_click")?.count || 0).toLocaleString()} detail="지도/테이블 합산" />
              <MetricCard icon={<DeviceMobile size={20} />} label="모바일 이벤트" value={(data.byDevice.find((row) => row.key === "mobile")?.count || 0).toLocaleString()} detail="user-agent 추정" />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <CountList title="이벤트 유형" rows={data.byEvent} renderKey={labelEvent} />
              <CountList title="상위 페이지" rows={data.byPath} />
              <CountList title="디바이스" rows={data.byDevice} />
              <CountList title="화면 모드" rows={data.byView} />
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-900">많이 열린 약국</h2>
              </div>
              <div className="divide-y divide-zinc-100">
                {data.topPharmacies.length ? data.topPharmacies.map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-800">{row.pharmacy?.name || row.key}</p>
                      {row.pharmacy && <p className="mt-0.5 text-xs text-zinc-400">{row.pharmacy.sido} {row.pharmacy.sigungu}</p>}
                    </div>
                    <span className="font-mono font-semibold text-zinc-900">{row.count.toLocaleString()}</span>
                  </div>
                )) : (
                  <div className="px-4 py-8 text-center text-sm text-zinc-400">약국 클릭 기록이 없습니다.</div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
                <ClockCounterClockwise size={16} className="text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-900">최근 이벤트</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">시간</th>
                      <th className="px-3 py-2 text-left font-medium">이벤트</th>
                      <th className="px-3 py-2 text-left font-medium">화면</th>
                      <th className="px-3 py-2 text-left font-medium">약국</th>
                      <th className="px-3 py-2 text-left font-medium">경로</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.recent.map((event, index) => (
                      <tr key={`${event.created_at}-${index}`}>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-zinc-500">{formatKstDateTime(event.created_at)}</td>
                        <td className="px-3 py-2 text-zinc-800">{labelEvent(event.event_name)}</td>
                        <td className="px-3 py-2 text-zinc-500">{event.view_name || "-"}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-500">{event.pharmacy_id || "-"}</td>
                        <td className="max-w-[240px] truncate px-3 py-2 text-zinc-500">{event.path || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-400">
            이메일로 로그인하거나 비상용 토큰을 입력하고 조회하면 이용 현황이 표시됩니다.
          </div>
        )}
      </div>
    </div>
  );
}
