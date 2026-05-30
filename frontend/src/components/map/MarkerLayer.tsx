// frontend/src/components/map/MarkerLayer.tsx
// Performance-optimized: uses Leaflet native API directly, bypasses React render cycle
"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { usePharmacyStore } from "@/lib/store";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { MarkerData } from "@/lib/types";

const PHARMACY_ICON_URL = "/icons/yakgook_1.svg";
const HERBAL_ICON_URL = "/icons/hanyakook_2.svg";
const ANIMAL_ICON_URL = "/icons/animal_pharmacy.svg";
const CROSS_EMPLOYMENT_ICON_URL = "/icons/cross_employment.svg";

function createIcon(m: MarkerData): L.DivIcon {
  let ring = "#059669";
  let border = "solid";
  let bg = "#ffffff";
  let inner = assetIcon(PHARMACY_ICON_URL, "약국");

  if (m.hr && !m.h) {
    ring = "#f59e0b";
    border = "dashed";
    bg = "#fffbeb";
    inner = assetIcon(HERBAL_ICON_URL, "한약국");
  } else if (m.c) {
    ring = "#7c3aed";
    bg = "#f5f3ff";
    inner = assetIcon(CROSS_EMPLOYMENT_ICON_URL, "교차고용");
  } else if (m.h) {
    ring = "#e11d48";
    bg = "#fff1f2";
    inner = assetIcon(HERBAL_ICON_URL, "한약국");
  } else if (m.a) {
    ring = "#ea580c";
    bg = "#fff7ed";
    inner = assetIcon(ANIMAL_ICON_URL, "동물약국");
  } else if (!m.y) {
    ring = "#6b7280";
    border = "dashed";
    bg = "#f9fafb";
    inner = assetIcon(PHARMACY_ICON_URL, "약국");
  }

  return L.divIcon({
    className: "",
    html: `<div style="width:31px;height:31px;border-radius:50% 50% 50% 9px;transform:rotate(-45deg);border:2.5px ${border} ${ring};background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 5px 14px rgba(15,23,42,.22);cursor:pointer"><div style="transform:rotate(45deg);display:flex;align-items:center;justify-content:center">${inner}</div></div>`,
    iconSize: [31, 31],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
}

function assetIcon(src: string, alt: string) {
  return `<img src="${src}" alt="${alt}" width="20" height="20" style="display:block;width:20px;height:20px;object-fit:contain;" />`;
}

function markerVisualKey(m: MarkerData): string {
  return [m.h, m.hr, m.a, m.c, m.y].map(Boolean).join(":");
}

function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const n = cluster.getChildCount();
  const sz = n > 100 ? 48 : n > 50 ? 42 : 36;
  const bg = n > 100 ? "rgba(5,150,105,.85)" : n > 50 ? "rgba(5,150,105,.8)" : "rgba(5,150,105,.7)";
  const label = n >= 1000 ? (Math.round(n / 100) / 10) + "k" : String(n);
  return L.divIcon({
    className: "",
    html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${n > 100 ? 14 : 12}px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.2)">${label}</div>`,
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  });
}

function popupHtml(m: MarkerData): string {
  const badges: string[] = [];
  if (m.h) badges.push('<span style="font-size:10px;padding:1px 4px;border-radius:4px;background:#ffe4e6;color:#be123c;border:1px solid #fecdd3">한약사</span>');
  if (m.hr) badges.push('<span style="font-size:10px;padding:1px 4px;border-radius:4px;background:#fef3c7;color:#b45309;border:1px dashed #f59e0b">현장 한약사 제보</span>');
  if (m.a) badges.push('<span style="font-size:10px;padding:1px 4px;border-radius:4px;background:#ffedd5;color:#c2410c;border:1px solid #fed7aa">동물약국</span>');
  if (m.c) badges.push('<span style="font-size:10px;padding:1px 4px;border-radius:4px;background:#ede9fe;color:#6d28d9;border:1px solid #ddd6fe">교차고용</span>');
  if (!m.y) badges.push('<span style="font-size:10px;padding:1px 4px;border-radius:4px;background:#f4f4f5;color:#52525b;border:1px solid #e4e4e7">요양X</span>');

  return `<div style="padding:8px;min-width:180px;font-family:var(--font-pretendard),system-ui,sans-serif">
    <p style="font-weight:600;font-size:14px;color:#18181b;margin:0 0 4px">${m.n}</p>
    ${m.p ? `<p style="font-size:12px;color:#71717a;margin:0 0 6px">${m.p}</p>` : ""}
    ${badges.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">${badges.join("")}</div>` : ""}
    <p style="font-size:11px;color:#a1a1aa;margin:0">${m.s} ${m.g}</p>
  </div>`;
}

interface MarkerLayerProps {
  markers: MarkerData[];
}

export function MarkerLayer({ markers }: MarkerLayerProps) {
  const map = useMap();
  const { isDenseView, selectedPharmacyId, selectedPharmacySeq, setSelectedPharmacyId } = usePharmacyStore();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markerCacheRef = useRef<Map<string, L.Marker>>(new Map());
  const markerVisualKeyRef = useRef<Map<string, string>>(new Map());
  const prevIdsRef = useRef<Set<string>>(new Set());
  const visibleIdsRef = useRef<Set<string>>(new Set());

  // Build marker cache once, reuse across filter changes
  useEffect(() => {
    // Ensure cluster group exists
    if (!clusterRef.current) {
      clusterRef.current = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: isDenseView ? 0 : 50,
        iconCreateFunction: clusterIcon,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        disableClusteringAtZoom: 18,
      });
      map.addLayer(clusterRef.current);
    }

    const cluster = clusterRef.current;
    const cache = markerCacheRef.current;
    const newIds = new Set(markers.map((m) => m.id));
    const prevIds = prevIdsRef.current;
    visibleIdsRef.current = newIds;

    // Create markers for new IDs
    const toAdd: L.Marker[] = [];
    for (const m of markers) {
      if (!cache.has(m.id)) {
        const marker = L.marker([m.lat, m.lng], { icon: createIcon(m) });
        marker.bindPopup(popupHtml(m));
        marker.on("click", () => {
          trackAnalyticsEvent({
            eventName: "pharmacy_click",
            pharmacyId: m.id,
            view: "map",
            metadata: {
              name: m.n,
              herbal: m.h,
              communityHerbal: Boolean(m.hr),
              animal: m.a,
              noYkiho: !m.y,
            },
          });
          setSelectedPharmacyId(m.id);
          marker.openPopup();
        });
        cache.set(m.id, marker);
        markerVisualKeyRef.current.set(m.id, markerVisualKey(m));
      } else {
        const key = markerVisualKey(m);
        const marker = cache.get(m.id)!;
        if (markerVisualKeyRef.current.get(m.id) !== key) {
          marker.setIcon(createIcon(m));
          marker.setPopupContent(popupHtml(m));
          markerVisualKeyRef.current.set(m.id, key);
        }
      }
      if (!prevIds.has(m.id)) {
        toAdd.push(cache.get(m.id)!);
      }
    }

    // Remove markers no longer in filtered set
    const toRemove: L.Marker[] = [];
    for (const id of prevIds) {
      if (!newIds.has(id) && cache.has(id)) {
        toRemove.push(cache.get(id)!);
      }
    }

    // Batch update — much faster than clearing + re-adding all
    if (toRemove.length > 0) cluster.removeLayers(toRemove);
    if (toAdd.length > 0) cluster.addLayers(toAdd);

    prevIdsRef.current = newIds;

    // If this is first load (prevIds was empty), add all
    // (handled by toAdd containing everything)

  }, [markers, map, setSelectedPharmacyId, isDenseView]);

  // Handle dense view toggle — rebuild cluster group
  useEffect(() => {
    if (!clusterRef.current) return;
    const cluster = clusterRef.current;
    const opts = cluster.options as any;
    const newRadius = isDenseView ? 0 : 50;
    if (opts.maxClusterRadius !== newRadius) {
      // Must recreate cluster group to change radius
      const currentMarkers = prevIdsRef.current;
      cluster.clearLayers();
      map.removeLayer(cluster);
      clusterRef.current = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: newRadius,
        iconCreateFunction: clusterIcon,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        disableClusteringAtZoom: 18,
      });
      const markersToAdd: L.Marker[] = [];
      for (const id of currentMarkers) {
        const m = markerCacheRef.current.get(id);
        if (m) markersToAdd.push(m);
      }
      clusterRef.current.addLayers(markersToAdd);
      map.addLayer(clusterRef.current);
    }
  }, [isDenseView, map]);

  useEffect(() => {
    if (!selectedPharmacyId || !clusterRef.current) return;
    if (!visibleIdsRef.current.has(selectedPharmacyId)) return;
    const marker = markerCacheRef.current.get(selectedPharmacyId);
    if (!marker) return;

    const latLng = marker.getLatLng();
    const focusMarker = () => {
      map.flyTo(latLng, Math.max(map.getZoom(), 16), { duration: 0.8 });
      marker.openPopup();
    };

    const cluster = clusterRef.current;
    try {
      if (cluster.hasLayer(marker)) {
        cluster.zoomToShowLayer(marker, focusMarker);
      } else {
        focusMarker();
      }
    } catch (error) {
      console.warn("Falling back to direct marker focus", error);
      focusMarker();
    }
  }, [selectedPharmacyId, selectedPharmacySeq, markers, map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [map]);

  return null; // All rendering handled by Leaflet directly
}
