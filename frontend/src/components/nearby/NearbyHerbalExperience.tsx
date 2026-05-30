"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  Crosshair,
  NavigationArrow,
  ShieldCheck,
  Warning,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { distanceKm } from "@/lib/geo";
import { usePharmacyStore } from "@/lib/store";
import type { MarkerData, MarkersJSON } from "@/lib/types";

const NearbyHerbalMap = dynamic(
  () => import("./NearbyHerbalMap").then((mod) => mod.NearbyHerbalMap),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  }
);

const RADIUS_OPTIONS = [1, 3, 5, 10];

function markersUrl() {
  const raw = process.env.NEXT_PUBLIC_MARKERS_JSON_URL;
  if (!raw) return "/markers.json";

  const cleaned = raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "")
    .trim();

  return cleaned || "/markers.json";
}

function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(km < 10 ? 1 : 0)}km`;
}

function MapSkeleton() {
  return (
    <div className="flex h-full min-h-[20rem] items-center justify-center overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-zinc-100">
      <div className="h-28 w-52 animate-pulse rounded-3xl bg-white/80" />
    </div>
  );
}

export function NearbyHerbalExperience() {
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [loadingMarkers, setLoadingMarkers] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [radiusKm, setRadiusKm] = useState(3);
  const { setSelectedPharmacyId } = usePharmacyStore();

  useEffect(() => {
    fetch(markersUrl())
      .then((res) => {
        if (!res.ok) throw new Error(`markers.json ${res.status}`);
        return res.json() as Promise<MarkersJSON>;
      })
      .then((data) => {
        setMarkers(data.pharmacies);
        setLoadingMarkers(false);
      })
      .catch((error) => {
        console.error("Failed to load nearby markers:", error);
        setLoadError("약국 위치 데이터를 불러오지 못했습니다.");
        setLoadingMarkers(false);
      });
  }, []);

  useEffect(() => {
    import("@/lib/supabase/client").then(({ supabase }) => {
      supabase
        .from("pharmacy_badge_assertions")
        .select("pharmacy_id")
        .eq("badge_type", "unregistered_herbal_staff")
        .eq("assertion_status", "published")
        .then(({ data, error }) => {
          if (error || !data?.length) return;
          const reportedIds = new Set(data.map((row) => row.pharmacy_id as string));
          setMarkers((current) =>
            current.map((marker) =>
              reportedIds.has(marker.id) ? { ...marker, hr: true } : marker
            )
          );
        });
    });
  }, []);

  const herbalMarkers = useMemo(
    () => markers.filter((marker) => marker.h || marker.hr),
    [markers]
  );

  const nearbyResults = useMemo(() => {
    if (!userLocation) return [];
    return herbalMarkers
      .map((marker) => ({ marker, distance: distanceKm(userLocation, marker) }))
      .filter((row) => row.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }, [herbalMarkers, radiusKm, userLocation]);

  const officialCount = nearbyResults.filter((row) => row.marker.h).length;
  const reportedOnlyCount = nearbyResults.filter((row) => row.marker.hr && !row.marker.h).length;
  const noYkihoCount = nearbyResults.filter((row) => !row.marker.y).length;
  const nearest = nearbyResults[0];

  const requestLocation = () => {
    setGeoError(null);
    setLocating(true);
    if (!navigator.geolocation) {
      setLocating(false);
      setGeoError("이 브라우저에서는 위치 기능을 사용할 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      (error) => {
        console.error("Nearby herbal geolocation error:", error);
        setLocating(false);
        setGeoError("위치 권한을 허용해야 주변 한약사 약국을 계산할 수 있습니다.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-[#f8faf9] text-zinc-950">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1400px] grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[0.86fr_1.14fr] md:gap-5 md:px-5 md:py-5">
        <section className="flex min-h-[calc(100dvh-2rem)] flex-col rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-[0_22px_60px_-42px_rgba(39,39,42,0.35)] md:p-7">
          <div className="mb-6 flex items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 active:scale-[0.98]"
            >
              <ArrowLeft size={14} weight="bold" />
              지도
            </Link>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              반경 기반
            </span>
          </div>

          <div className="max-w-[34rem]">
            <p className="mb-3 text-sm font-semibold text-emerald-700">내 주변 한약사 약국</p>
            <h1 className="text-4xl font-black leading-[0.95] tracking-tight text-zinc-950 md:text-5xl">
              지금 위치에서
              <br />
              몇 곳인지 바로 봅니다.
            </h1>
            <p className="mt-4 text-sm leading-6 text-zinc-600">
              위치 권한을 허용하면 반경 안의 한약사·한약국을 계산하고, 공식 HIRA 기준과 현장 제보 승인 건을 나눠 보여줍니다.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-1.5">
            {RADIUS_OPTIONS.map((radius) => (
              <button
                key={radius}
                type="button"
                onClick={() => setRadiusKm(radius)}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition active:scale-[0.98] ${
                  radiusKm === radius
                    ? "bg-zinc-950 text-white shadow-sm"
                    : "text-zinc-500 hover:bg-white hover:text-zinc-900"
                }`}
              >
                {radius}km
              </button>
            ))}
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={requestLocation}
              disabled={locating || loadingMarkers}
              className="group inline-flex w-full items-center justify-between rounded-2xl bg-emerald-700 px-5 py-4 text-left text-white shadow-[0_18px_40px_-24px_rgba(4,120,87,0.8)] transition hover:bg-emerald-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>
                <span className="block text-sm font-bold">
                  {userLocation ? "내 위치 다시 계산" : "내 주변 한약사 약국 보기"}
                </span>
                <span className="mt-1 block text-xs text-emerald-50/80">
                  {locating ? "현재 위치를 확인하고 있습니다" : `반경 ${radiusKm}km 기준으로 지도에 표시`}
                </span>
              </span>
              <Crosshair
                size={22}
                weight="bold"
                className={locating ? "animate-pulse" : "transition group-hover:rotate-45"}
              />
            </button>
            {geoError && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                {geoError}
              </p>
            )}
            {loadError && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {loadError}
              </p>
            )}
          </div>

          <AnimatePresence mode="wait">
            {userLocation ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="mt-6 flex min-h-0 flex-1 flex-col"
              >
                <div className="grid grid-cols-[1.35fr_1fr] gap-3">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-bold text-emerald-700">반경 {radiusKm}km 안</p>
                    <p className="mt-2 font-mono text-5xl font-black tracking-tight text-emerald-950">
                      {nearbyResults.length}
                    </p>
                    <p className="mt-1 text-xs font-medium text-emerald-800">한약사·한약국 후보</p>
                  </div>
                  <div className="grid gap-2">
                    <Metric label="공식 HIRA" value={officialCount} />
                    <Metric label="현장 제보" value={reportedOnlyCount} />
                    <Metric label="요양X" value={noYkihoCount} />
                  </div>
                </div>

                {nearest && (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-zinc-400">가장 가까운 곳</p>
                        <p className="mt-1 text-base font-black text-zinc-950">{nearest.marker.n}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {nearest.marker.s} {nearest.marker.g}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-black text-emerald-700">
                        {formatDistance(nearest.distance)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  {nearbyResults.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
                      이 반경 안에서는 표시할 한약사·한약국 후보가 없습니다. 5km 또는 10km로 넓혀보세요.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {nearbyResults.slice(0, 12).map(({ marker, distance }, index) => (
                        <button
                          key={marker.id}
                          type="button"
                          onClick={() => setSelectedPharmacyId(marker.id)}
                          className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/45 active:scale-[0.99]"
                          style={{ animationDelay: `${index * 45}ms` }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-zinc-900">{marker.n}</p>
                              <p className="mt-1 truncate text-xs text-zinc-500">{marker.s} {marker.g}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {marker.h && <Badge tone="rose">HIRA 한약사</Badge>}
                                {marker.hr && <Badge tone="amber">현장 제보</Badge>}
                                {!marker.y && <Badge tone="zinc">요양X</Badge>}
                              </div>
                            </div>
                            <span className="shrink-0 font-mono text-xs font-black text-zinc-500">
                              {formatDistance(distance)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-auto grid gap-3 border-t border-zinc-100 pt-6"
              >
                <Hint icon={<NavigationArrow size={17} weight="bold" />} title="현재 위치 기준">
                  주소를 입력하지 않아도, 위치 권한 한 번으로 반경 계산을 시작합니다.
                </Hint>
                <Hint icon={<ShieldCheck size={17} weight="bold" />} title="근거 분리">
                  공식 인력 데이터와 현장 제보 승인 건을 같은 숫자로 섞지 않습니다.
                </Hint>
                <Hint icon={<Warning size={17} weight="bold" />} title="요양X 표시">
                  요양기관번호가 없는 약국은 별도 배지로 표시해 해석 여지를 남깁니다.
                </Hint>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="min-h-[28rem] overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-white p-2 shadow-[0_22px_60px_-42px_rgba(39,39,42,0.35)] md:min-h-[calc(100dvh-2.5rem)]">
          <NearbyHerbalMap
            markers={nearbyResults.map((row) => row.marker)}
            allHerbalMarkers={herbalMarkers}
            userLocation={userLocation}
            radiusKm={radiusKm}
          />
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">
      <p className="text-[10px] font-bold text-zinc-400">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-black text-zinc-950">{value}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "rose" | "amber" | "zinc"; children: React.ReactNode }) {
  const styles = {
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-600",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${styles[tone]}`}>
      {children}
    </span>
  );
}

function Hint({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-sm font-black text-zinc-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{children}</p>
      </div>
    </div>
  );
}
