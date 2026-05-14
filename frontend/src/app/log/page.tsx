"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Database,
  GitBranch,
  Pulse,
  WarningCircle,
} from "@phosphor-icons/react";

type SyncStatus = "success" | "failed" | "partial" | "manual_note" | string;

interface SyncSourceCounts {
  localdata_pharmacies: number | null;
  localdata_animal_pharmacies: number | null;
  hira_pharmacies: number | null;
  nmc_pharmacies: number | null;
  matched_hira: number | null;
  unmatched_hira: number | null;
  matched_animal: number | null;
  unmatched_animal: number | null;
  new_pharmacies: number | null;
  closed_pharmacies: number | null;
  changed_pharmacies: number | null;
}

interface SyncEvent {
  id: string;
  status: SyncStatus;
  started_at: string | null;
  finished_at: string;
  github_run_id: string;
  github_run_number: string;
  github_sha: string;
  github_ref: string;
  github_actor: string;
  github_run_url: string;
  exit_code: number | null;
  markers_generated_at: string | null;
  marker_count: number | null;
  source_counts: SyncSourceCounts;
  errors: string[];
}

interface SyncLog {
  version: number;
  updated_at: string;
  latest: SyncEvent;
  events: SyncEvent[];
}

interface MarkersSummary {
  generated_at: string;
  count: number;
}

const numberFormat = new Intl.NumberFormat("ko-KR");

export default function LogPage() {
  const [syncLog, setSyncLog] = useState<SyncLog | null>(null);
  const [markers, setMarkers] = useState<MarkersSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [logResponse, markersResponse] = await Promise.all([
          fetch("/sync-log.json", { cache: "no-store" }),
          fetch("/markers.json", { cache: "no-store" }),
        ]);

        if (!logResponse.ok) {
          throw new Error(`sync-log.json ${logResponse.status}`);
        }
        if (!markersResponse.ok) {
          throw new Error(`markers.json ${markersResponse.status}`);
        }

        const [logData, markerData] = await Promise.all([
          logResponse.json(),
          markersResponse.json(),
        ]);

        if (!cancelled) {
          setSyncLog(logData as SyncLog);
          setMarkers({
            generated_at: markerData.generated_at,
            count: markerData.count,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "로그를 불러오지 못했습니다.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = syncLog?.latest;
  const dataAge = useMemo(() => {
    if (!markers?.generated_at) return null;
    const generated = new Date(markers.generated_at).getTime();
    if (Number.isNaN(generated)) return null;
    const diffHours = (Date.now() - generated) / (1000 * 60 * 60);
    return {
      hours: diffHours,
      label:
        diffHours < 24
          ? `${Math.max(1, Math.round(diffHours))}시간 전`
          : `${Math.round(diffHours / 24)}일 전`,
      stale: diffHours > 36,
    };
  }, [markers?.generated_at]);

  return (
    <div className="h-full overflow-y-auto bg-zinc-50">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
            >
              <ArrowLeft size={16} />
              지도 돌아가기
            </Link>
            <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
              데이터 동기화 로그
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              약국 목록이 언제 생성됐고, 자동 동기화가 어느 단계까지 갔는지 확인하는 운영용 페이지입니다.
            </p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
            정기 실행: 매일 12:00 KST
          </div>
        </header>

        {loadError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {loadError}
          </div>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <StatusCard
                icon={<Database size={18} />}
                label="배포 데이터"
                value={markers ? formatNumber(markers.count) : "로딩 중"}
                detail={
                  markers
                    ? `markers.json 생성: ${formatDateTime(markers.generated_at)}`
                    : "markers.json 확인 중"
                }
                tone={dataAge?.stale ? "warn" : "ok"}
              />
              <StatusCard
                icon={<Pulse size={18} />}
                label="최신 동기화"
                value={latest ? statusLabel(latest.status) : "로딩 중"}
                detail={
                  latest
                    ? `${formatDateTime(latest.finished_at)} · run #${latest.github_run_number || "-"}`
                    : "sync-log.json 확인 중"
                }
                tone={latest?.status === "failed" ? "danger" : "ok"}
              />
              <StatusCard
                icon={<Clock size={18} />}
                label="데이터 나이"
                value={dataAge ? dataAge.label : "계산 중"}
                detail={dataAge?.stale ? "36시간 이상 지나 점검이 필요합니다." : "최근 생성 데이터입니다."}
                tone={dataAge?.stale ? "warn" : "ok"}
              />
            </section>

            <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-md border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-zinc-900">최근 실행 기록</h2>
                </div>
                <div className="divide-y divide-zinc-100">
                  {(syncLog?.events ?? []).map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                  {!syncLog?.events?.length && (
                    <p className="px-4 py-8 text-sm text-zinc-500">아직 기록된 실행이 없습니다.</p>
                  )}
                </div>
              </div>

              <aside className="space-y-5">
                <div className="rounded-md border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">최신 실행 상세</h2>
                  </div>
                  {latest ? <LatestDetails event={latest} markers={markers} /> : <DetailSkeleton />}
                </div>

                <div className="rounded-md border border-zinc-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-zinc-900">확인 포인트</h2>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
                    <li>배포 데이터 생성일이 오래됐으면 `markers.json` 커밋 또는 Vercel 배포가 멈춘 상태입니다.</li>
                    <li>실행 기록이 실패면 GitHub Actions 로그 링크에서 실패 단계를 먼저 보면 됩니다.</li>
                    <li>LOCALDATA 수와 배포 데이터 수 차이가 크면 신규 개업 약국 누락 가능성이 높습니다.</li>
                  </ul>
                </div>
              </aside>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warn" | "danger";
}) {
  const toneClass = {
    ok: "text-emerald-700 bg-emerald-50 border-emerald-100",
    warn: "text-amber-700 bg-amber-50 border-amber-100",
    danger: "text-rose-700 bg-rose-50 border-rose-100",
  }[tone];

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className={`mb-4 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${toneClass}`}>
        {icon}
        {label}
      </div>
      <p className="text-2xl font-semibold tracking-normal text-zinc-950">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{detail}</p>
    </div>
  );
}

function EventRow({ event }: { event: SyncEvent }) {
  const failed = event.status === "failed";
  const manual = event.status === "manual_note";

  return (
    <div className="grid gap-3 px-4 py-4 sm:grid-cols-[160px_1fr_auto] sm:items-start">
      <div className="flex items-center gap-2">
        {failed ? (
          <WarningCircle size={18} className="text-rose-600" />
        ) : manual ? (
          <GitBranch size={18} className="text-zinc-500" />
        ) : (
          <CheckCircle size={18} className="text-emerald-600" />
        )}
        <span className="text-sm font-semibold text-zinc-900">{statusLabel(event.status)}</span>
      </div>
      <div>
        <p className="text-sm text-zinc-900">
          {formatDateTime(event.finished_at)}
          {event.marker_count ? ` · ${formatNumber(event.marker_count)}개 마커` : ""}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {event.github_ref || "unknown ref"}
          {event.github_sha ? ` · ${event.github_sha.slice(0, 7)}` : ""}
          {event.github_actor ? ` · ${event.github_actor}` : ""}
        </p>
        {event.errors?.length > 0 && (
          <p className="mt-2 rounded-md bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
            {event.errors[0]}
          </p>
        )}
      </div>
      {event.github_run_url && (
        <a
          href={event.github_run_url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
        >
          Actions 열기
        </a>
      )}
    </div>
  );
}

function LatestDetails({
  event,
  markers,
}: {
  event: SyncEvent;
  markers: MarkersSummary | null;
}) {
  const currentMarkerCount = markers?.count ?? null;
  const localdataCount = event.source_counts.localdata_pharmacies;
  const markerDelta =
    currentMarkerCount !== null && localdataCount !== null
      ? localdataCount - currentMarkerCount
      : null;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="LOCALDATA 약국" value={formatNullable(event.source_counts.localdata_pharmacies)} />
        <Metric label="배포 마커" value={formatNullable(currentMarkerCount)} />
        <Metric label="신규" value={formatNullable(event.source_counts.new_pharmacies)} />
        <Metric label="폐업" value={formatNullable(event.source_counts.closed_pharmacies)} />
        <Metric label="HIRA 매칭" value={formatNullable(event.source_counts.matched_hira)} />
        <Metric label="동물약국 매칭" value={formatNullable(event.source_counts.matched_animal)} />
      </div>

      {markerDelta !== null && (
        <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-semibold text-zinc-500">LOCALDATA - 배포 마커 차이</p>
          <p className={`mt-1 text-lg font-semibold ${markerDelta > 0 ? "text-amber-700" : "text-zinc-900"}`}>
            {markerDelta > 0 ? "+" : ""}
            {formatNumber(markerDelta)}
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-md bg-zinc-100" />
      ))}
    </div>
  );
}

function statusLabel(status: SyncStatus) {
  switch (status) {
    case "success":
      return "성공";
    case "failed":
      return "실패";
    case "partial":
      return "부분 성공";
    case "manual_note":
      return "운영 메모";
    default:
      return status || "알 수 없음";
  }
}

function formatNumber(value: number) {
  return numberFormat.format(value);
}

function formatNullable(value: number | null | undefined) {
  return typeof value === "number" ? formatNumber(value) : "-";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
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
