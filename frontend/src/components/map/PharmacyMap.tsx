// frontend/src/components/map/PharmacyMap.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { usePharmacyStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import type { MarkersJSON, MarkerData } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { distanceKm } from "@/lib/geo";

const NEARBY_RADIUS_KM = 3;

// Dynamic import of the entire map inner component — avoids SSR issues with Leaflet + react-leaflet-cluster
const MapInner = dynamic(() => import("./MapInner").then((mod) => mod.MapInner), {
  ssr: false,
  loading: () => <Skeleton className="flex-1 h-full" />,
});

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

export function PharmacyMap() {
  const { markers, setMarkers, filters, userLocation } = usePharmacyStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportedHerbalIds, setReportedHerbalIds] = useState<Set<string>>(new Set());

  // Fetch markers.json from CDN on mount
  useEffect(() => {
    const url = markersUrl();
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch markers: ${res.status}`);
        return res.json() as Promise<MarkersJSON>;
      })
      .then((data) => {
        setMarkers(data.pharmacies);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load markers:", err);
        setError("마커 데이터를 불러오지 못했습니다.");
        setLoading(false);
      });
  }, [setMarkers]);

  useEffect(() => {
    supabase
      .from("pharmacy_badge_assertions")
      .select("pharmacy_id")
      .eq("badge_type", "unregistered_herbal_staff")
      .eq("assertion_status", "published")
      .then(({ data, error: badgeError }) => {
        if (badgeError) {
          console.warn("Failed to load community herbal reports:", badgeError);
          return;
        }
        setReportedHerbalIds(new Set((data || []).map((row) => row.pharmacy_id as string)));
      });
  }, []);

  const augmentedMarkers = useMemo((): MarkerData[] => {
    if (reportedHerbalIds.size === 0) return markers;
    return markers.map((marker) =>
      reportedHerbalIds.has(marker.id)
        ? { ...marker, hr: true }
        : marker
    );
  }, [markers, reportedHerbalIds]);

  // Filter markers based on current filter state
  const filteredMarkers = useMemo((): MarkerData[] => {
    let result = augmentedMarkers;

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (m) =>
          m.n.toLowerCase().includes(q) ||
          m.p?.includes(q)
      );
    }
    if (filters.sido) {
      result = result.filter((m) => m.s === filters.sido);
    }
    if (filters.sigungu) {
      result = result.filter((m) => m.g === filters.sigungu);
    }
    if (filters.herbal) {
      result = result.filter((m) => m.h || m.hr);
    }
    if (filters.animal) {
      result = result.filter((m) => m.a);
    }
    if (filters.cross) {
      result = result.filter((m) => m.c);
    }
    if (filters.noYkiho) {
      result = result.filter((m) => !m.y);
    }
    if (filters.openedFrom) {
      result = result.filter((m) => m.o && m.o >= filters.openedFrom);
    }
    if (filters.openedTo) {
      result = result.filter((m) => m.o && m.o <= filters.openedTo);
    }
    if (filters.nearby && userLocation) {
      result = result.filter((m) => distanceKm(userLocation, m) <= NEARBY_RADIUS_KM);
    }

    return result;
  }, [augmentedMarkers, filters, userLocation]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50">
        <div className="text-center space-y-2">
          <p className="text-zinc-500 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-emerald-600 text-sm underline"
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      {loading && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-zinc-50/80">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-zinc-500 text-sm">약국 데이터 로딩 중...</p>
          </div>
        </div>
      )}
      <MapInner filteredMarkers={filteredMarkers} />
    </div>
  );
}
