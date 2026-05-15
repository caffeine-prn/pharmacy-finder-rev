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
import { supabase } from "@/lib/supabase/client";

type SyncStatus = "success" | "failed" | "partial" | "manual_note" | string;

interface SyncSourceCounts {
  localdata_pharmacies: number | null;
  localdata_animal_pharmacies: number | null;
  hira_pharmacies: number | null;
  hira_opclo_events: number | null;
  hira_opclo_opened: number | null;
  hira_opclo_closed: number | null;
  hira_opclo_suspended: number | null;
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

interface DbSyncEvent {
  id: number;
  sync_type: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: SyncStatus;
  pharmacy_count: number | null;
  animal_count: number | null;
  staff_count: number | null;
  errors: string[] | null;
  metadata: Record<string, unknown> | null;
  new_pharmacies: number | null;
  closed_pharmacies: number | null;
  changed_pharmacies: number | null;
}

interface FreshnessRow {
  source: string;
  last_sync: string | null;
  data_date: string | null;
  record_count: number | null;
  notes: string | null;
}

interface MarkersSummary {
  generated_at: string;
  count: number;
  herbal: number;
  animal: number;
  cross: number;
  ykiho: number;
  noYkiho: number;
  herbalAnimal: number;
  herbalNoYkiho: number;
  animalNoYkiho: number;
  crossNoYkiho: number;
  onlyHerbal: number;
  onlyAnimal: number;
  onlyNoYkiho: number;
}

const numberFormat = new Intl.NumberFormat("ko-KR");

export default function LogPage() {
  const [syncLog, setSyncLog] = useState<SyncLog | null>(null);
  const [markers, setMarkers] = useState<MarkersSummary | null>(null);
  const [dbEvents, setDbEvents] = useState<DbSyncEvent[]>([]);
  const [freshness, setFreshness] = useState<FreshnessRow[]>([]);
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
        const [dbLogResult, freshnessResult] = await Promise.all([
          supabase
            .from("sync_log")
            .select(
              "id,sync_type,started_at,completed_at,status,pharmacy_count,animal_count,staff_count,errors,metadata,new_pharmacies,closed_pharmacies,changed_pharmacies"
            )
            .order("started_at", { ascending: false })
            .limit(20),
          supabase
            .from("data_freshness")
            .select("source,last_sync,data_date,record_count,notes")
            .order("last_sync", { ascending: false }),
        ]);

        if (!cancelled) {
          setSyncLog(logData as SyncLog);
          setMarkers(buildMarkersSummary(markerData));
          setDbEvents((dbLogResult.data ?? []) as DbSyncEvent[]);
          setFreshness((freshnessResult.data ?? []) as FreshnessRow[]);
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

  const staffFreshness = freshness.find((row) => row.source === "hira_staff_lookup_batch")
    ?? freshness.find((row) => row.source === "hira_staff_lookup");

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
                label="인력조회"
                value={
                  staffFreshness?.record_count != null
                    ? `${formatNumber(staffFreshness.record_count)}건`
                    : "기록 없음"
                }
                detail={
                  staffFreshness
                    ? `${sourceLabel(staffFreshness.source)} · ${formatDateTime(staffFreshness.last_sync)}`
                    : "아직 배치 실행 기록이 없습니다."
                }
                tone={staffFreshness ? "ok" : "warn"}
              />
            </section>

            <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-md border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-zinc-900">DB 운영 로그</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    일일 동기화와 HIRA 인력조회 배치가 Supabase `sync_log`에 남긴 기록입니다.
                  </p>
                </div>
                <div className="divide-y divide-zinc-100">
                  {dbEvents.map((event) => (
                    <DbEventRow key={event.id} event={event} />
                  ))}
                  {!dbEvents.length && (
                    <p className="px-4 py-8 text-sm text-zinc-500">아직 DB에 기록된 실행이 없습니다.</p>
                  )}
                </div>
              </div>

              <aside className="space-y-5">
                <div className="rounded-md border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">데이터 소스 신선도</h2>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {freshness.map((row) => (
                      <FreshnessRowItem key={row.source} row={row} />
                    ))}
                    {!freshness.length && (
                      <p className="px-4 py-6 text-sm text-zinc-500">신선도 기록이 없습니다.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-zinc-900">배포 로그 상세</h2>
                  </div>
                  {latest ? <LatestDetails event={latest} markers={markers} /> : <DetailSkeleton />}
                </div>

                <div className="rounded-md border border-zinc-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-zinc-900">확인 포인트</h2>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
                    <li>배포 데이터 생성일이 오래됐으면 `markers.json` 커밋 또는 Vercel 배포가 멈춘 상태입니다.</li>
                    <li>`hira_staff_lookup_batch`가 오래됐거나 실패면 인력 구성 숫자가 오래된 상태입니다.</li>
                    <li>실행 기록이 실패면 DB 운영 로그의 오류와 GitHub Actions 원본 로그를 같이 보면 됩니다.</li>
                  </ul>
                </div>
              </aside>
            </section>

            <section className="mt-5 rounded-md border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-900">배포 파일 실행 기록</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  `sync-log.json`에 저장된 지도 데이터 생성 워크플로 기록입니다.
                </p>
              </div>
              <div className="divide-y divide-zinc-100">
                {(syncLog?.events ?? []).map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
                {!syncLog?.events?.length && (
                  <p className="px-4 py-8 text-sm text-zinc-500">아직 기록된 실행이 없습니다.</p>
                )}
              </div>
            </section>

            {markers && (
              <section className="mt-5 rounded-md border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-zinc-900">집합 관계</h2>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    요양X는 행안부 약국 목록 중 HIRA 약국 기본목록과 보강 이벤트에 아직 매칭되지 않은 상태입니다.
                  </p>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-4">
                  <Metric label="행안부 약국 마커" value={formatNumber(markers.count)} />
                  <Metric label="HIRA 요양기관" value={formatNumber(markers.ykiho)} />
                  <Metric label="요양X" value={formatNumber(markers.noYkiho)} />
                  <Metric label="동물약국" value={formatNumber(markers.animal)} />
                  <Metric label="한약사" value={formatNumber(markers.herbal)} />
                  <Metric label="교차고용" value={formatNumber(markers.cross)} />
                  <Metric label="한약사 ∩ 동물약국" value={formatNumber(markers.herbalAnimal)} />
                  <Metric label="동물약국 ∩ 요양X" value={formatNumber(markers.animalNoYkiho)} />
                  <Metric label="한약사 ∩ 요양X" value={formatNumber(markers.herbalNoYkiho)} />
                  <Metric label="교차고용 ∩ 요양X" value={formatNumber(markers.crossNoYkiho)} />
                  <Metric label="한약사 only" value={formatNumber(markers.onlyHerbal)} />
                  <Metric label="요양X only" value={formatNumber(markers.onlyNoYkiho)} />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function buildMarkersSummary(markerData: any): MarkersSummary {
  const rows = Array.isArray(markerData.pharmacies) ? markerData.pharmacies : [];
  const summary: MarkersSummary = {
    generated_at: markerData.generated_at,
    count: markerData.count ?? rows.length,
    herbal: 0,
    animal: 0,
    cross: 0,
    ykiho: 0,
    noYkiho: 0,
    herbalAnimal: 0,
    herbalNoYkiho: 0,
    animalNoYkiho: 0,
    crossNoYkiho: 0,
    onlyHerbal: 0,
    onlyAnimal: 0,
    onlyNoYkiho: 0,
  };

  for (const row of rows) {
    const herbal = Boolean(row.h);
    const animal = Boolean(row.a);
    const cross = Boolean(row.c);
    const ykiho = Boolean(row.y);
    if (herbal) summary.herbal += 1;
    if (animal) summary.animal += 1;
    if (cross) summary.cross += 1;
    if (ykiho) summary.ykiho += 1;
    if (!ykiho) summary.noYkiho += 1;
    if (herbal && animal) summary.herbalAnimal += 1;
    if (herbal && !ykiho) summary.herbalNoYkiho += 1;
    if (animal && !ykiho) summary.animalNoYkiho += 1;
    if (cross && !ykiho) summary.crossNoYkiho += 1;
    if (herbal && !animal && !cross && ykiho) summary.onlyHerbal += 1;
    if (animal && !herbal && !cross && ykiho) summary.onlyAnimal += 1;
    if (!ykiho && !herbal && !animal && !cross) summary.onlyNoYkiho += 1;
  }
  return summary;
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

function DbEventRow({ event }: { event: DbSyncEvent }) {
  const failed = event.status === "failed";
  const partial = event.status === "partial";
  const metadata = event.metadata ?? {};
  const lookedUp = numberFromMetadata(metadata, "looked_up") ?? numberFromMetadata(metadata, "looked_up_count");
  const candidates = numberFromMetadata(metadata, "candidate_count");
  const rawRows = numberFromMetadata(metadata, "raw_rows");

  return (
    <div className="grid gap-3 px-4 py-4 sm:grid-cols-[190px_1fr] sm:items-start">
      <div className="flex items-center gap-2">
        {failed ? (
          <WarningCircle size={18} className="text-rose-600" />
        ) : partial ? (
          <WarningCircle size={18} className="text-amber-600" />
        ) : (
          <CheckCircle size={18} className="text-emerald-600" />
        )}
        <div>
          <span className="block text-sm font-semibold text-zinc-900">
            {syncTypeLabel(event.sync_type)}
          </span>
          <span className="text-xs text-zinc-500">{statusLabel(event.status)}</span>
        </div>
      </div>
      <div>
        <p className="text-sm text-zinc-900">
          {formatDateTime(event.completed_at ?? event.started_at)}
          {event.staff_count ? ` · 인력 원천 ${formatNumber(event.staff_count)}건` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <SmallPill label="후보" value={formatNullable(candidates)} />
          <SmallPill label="조회" value={formatNullable(lookedUp ?? event.pharmacy_count)} />
          <SmallPill label="원천행" value={formatNullable(rawRows ?? event.staff_count)} />
          <SmallPill label="신규" value={formatNullable(event.new_pharmacies)} />
          <SmallPill label="폐업" value={formatNullable(event.closed_pharmacies)} />
        </div>
        {event.errors?.length ? (
          <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
            {String(event.errors[0])}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function FreshnessRowItem({ row }: { row: FreshnessRow }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">{sourceLabel(row.source)}</p>
          <p className="mt-1 text-xs text-zinc-500">{formatDateTime(row.last_sync)}</p>
        </div>
        <span className="rounded-md bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-700">
          {formatNullable(row.record_count)}
        </span>
      </div>
      {row.notes && <p className="mt-2 text-xs leading-5 text-zinc-500">{row.notes}</p>}
    </div>
  );
}

function SmallPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
      {label} <b className="font-mono text-zinc-900">{value}</b>
    </span>
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
      <div className="grid gap-3">
        <Metric label="LOCALDATA 약국" value={formatNullable(event.source_counts.localdata_pharmacies)} />
        <Metric label="배포 마커" value={formatNullable(currentMarkerCount)} />
        <Metric label="신규" value={formatNullable(event.source_counts.new_pharmacies)} />
        <Metric label="폐업" value={formatNullable(event.source_counts.closed_pharmacies)} />
        <Metric label="HIRA 매칭" value={formatNullable(event.source_counts.matched_hira)} />
        <Metric label="동물약국 매칭" value={formatNullable(event.source_counts.matched_animal)} />
        <Metric label="HIRA 개폐업 보강" value={formatNullable(event.source_counts.hira_opclo_events)} />
        <Metric label="보강 개업" value={formatNullable(event.source_counts.hira_opclo_opened)} />
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

function syncTypeLabel(value: string | null | undefined) {
  switch (value) {
    case "daily":
      return "일일 데이터 동기화";
    case "hira_staff_lookup_batch":
      return "HIRA 인력조회 배치";
    case "staff_lookup_backfill":
      return "HIRA 인력조회 보강";
    default:
      return value || "알 수 없는 실행";
  }
}

function sourceLabel(value: string) {
  switch (value) {
    case "mois_pharmacy_api":
      return "행안부 약국";
    case "mois_animal_pharmacy_api":
      return "행안부 동물약국";
    case "hira_pharmacy":
      return "HIRA 약국";
    case "hira_opclo":
      return "HIRA 개폐업";
    case "hira_staff_lookup":
      return "HIRA 인력조회";
    case "hira_staff_lookup_batch":
      return "HIRA 인력조회 배치";
    case "nmc_hours":
      return "공공 심야/휴일 정보";
    default:
      return value;
  }
}

function numberFromMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" ? value : null;
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
