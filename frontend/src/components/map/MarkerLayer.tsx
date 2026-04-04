// frontend/src/components/map/MarkerLayer.tsx
"use client";

import { useCallback, useMemo, useEffect } from "react";
import { useMap, Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { usePharmacyStore } from "@/lib/store";
import type { MarkerData } from "@/lib/types";

/** Create a custom DivIcon for a pharmacy marker */
function createPharmacyIcon(marker: MarkerData): L.DivIcon {
  let ringColor = "#059669"; // emerald — default pharmacy
  const bgColor = "#ffffff";
  let borderStyle = "solid";
  let innerHtml = "";

  if (marker.h && !marker.a) {
    // Herbal pharmacy
    ringColor = "#e11d48";
    innerHtml = `<svg width="14" height="14" viewBox="0 0 256 256" fill="${ringColor}"><path d="M205.41,159.07a60.9,60.9,0,0,1-31.83,8.86,71.71,71.71,0,0,1-24.3-4.43,162.24,162.24,0,0,0,19-44.27A59.75,59.75,0,0,1,205.41,159.07ZM128,44a97.83,97.83,0,0,0-18,1.68A60,60,0,0,1,192,88c0,50.29-37.53,93.07-64,112.68-26.47-19.61-64-62.39-64-112.68A60,60,0,0,1,128,44Z"/></svg>`;
  } else if (marker.a && !marker.h) {
    // Animal pharmacy
    ringColor = "#ea580c";
    innerHtml = `<svg width="14" height="14" viewBox="0 0 256 256" fill="${ringColor}"><path d="M212,80a28,28,0,1,0,28,28A28,28,0,0,0,212,80ZM44,80a28,28,0,1,0,28,28A28,28,0,0,0,44,80Zm68-44A28,28,0,1,0,84,64,28,28,0,0,0,112,36Zm60,0a28,28,0,1,0-28,28A28,28,0,0,0,172,36ZM188,168c-16.59,0-32.63-8.61-42.89-21.86a4,4,0,0,0-6.22,0C128.63,159.39,112.59,168,96,168a52,52,0,0,0,0,104c30,0,44-20,44-44V204a28,28,0,0,1,56,0v24c0,24,14,44,44,44a52,52,0,0,0,0-104Z"/></svg>`;
  } else if (marker.c) {
    // Cross-employed
    ringColor = "#7c3aed";
    innerHtml = `<span style="color:${ringColor};font-size:11px;font-weight:700;">+</span>`;
  } else if (!marker.y) {
    // No ykiho
    ringColor = "#6b7280";
    borderStyle = "dashed";
  }

  return L.divIcon({
    className: "custom-pharmacy-marker",
    html: `
      <div style="
        width: 28px; height: 28px;
        border-radius: 50%;
        border: 2.5px ${borderStyle} ${ringColor};
        background: ${bgColor};
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        cursor: pointer;
      ">
        ${innerHtml || `<div style="width:8px;height:8px;border-radius:50%;background:${ringColor};"></div>`}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

/** Cluster icon factory */
function createClusterIcon(cluster: any): L.DivIcon {
  const count = cluster.getChildCount();
  let size = 36;
  let bg = "rgba(5,150,105,0.7)";

  if (count > 100) {
    size = 48;
    bg = "rgba(5,150,105,0.85)";
  } else if (count > 50) {
    size = 42;
    bg = "rgba(5,150,105,0.8)";
  }

  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:${bg};
      color:white;
      display:flex;align-items:center;justify-content:center;
      font-size:${count > 100 ? 14 : 12}px;
      font-weight:600;
      font-family:var(--font-pretendard),system-ui,sans-serif;
      box-shadow:0 2px 8px rgba(0,0,0,0.2);
    ">${count >= 1000 ? Math.round(count / 100) / 10 + "k" : count}</div>`,
    className: "marker-cluster-pharmacy",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface MarkerLayerProps {
  markers: MarkerData[];
}

export function MarkerLayer({ markers }: MarkerLayerProps) {
  const { isDenseView, setSelectedPharmacyId } = usePharmacyStore();
  const map = useMap();

  // Adaptive dense view guard: if too many visible markers, warn
  useEffect(() => {
    function onZoomEnd() {
      if (!isDenseView) return;
      const bounds = map.getBounds();
      const visible = markers.filter((m) =>
        bounds.contains([m.lat, m.lng])
      );
      if (visible.length > 5000) {
        console.warn(`Dense view: ${visible.length} markers visible — performance may degrade.`);
      }
    }
    map.on("zoomend", onZoomEnd);
    return () => {
      map.off("zoomend", onZoomEnd);
    };
  }, [map, markers, isDenseView]);

  const handleMarkerClick = useCallback(
    (id: string) => {
      setSelectedPharmacyId(id);
    },
    [setSelectedPharmacyId]
  );

  const markerElements = useMemo(() => {
    return markers.map((m) => (
      <Marker
        key={m.id}
        position={[m.lat, m.lng]}
        icon={createPharmacyIcon(m)}
        eventHandlers={{
          click: () => handleMarkerClick(m.id),
        }}
      >
        <Popup>
          <div className="p-2 min-w-[180px]">
            <p className="font-semibold text-sm text-zinc-900 mb-1">{m.n}</p>
            {m.p && (
              <p className="text-xs text-zinc-500 mb-1.5">{m.p}</p>
            )}
            <div className="flex flex-wrap gap-1">
              {m.h && <span className="text-[10px] px-1 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">한약사</span>}
              {m.a && <span className="text-[10px] px-1 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">동물약국</span>}
              {m.c && <span className="text-[10px] px-1 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">교차고용</span>}
              {!m.y && <span className="text-[10px] px-1 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">요양X</span>}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1.5">
              {m.s} {m.g}
            </p>
          </div>
        </Popup>
      </Marker>
    ));
  }, [markers, handleMarkerClick]);

  if (isDenseView) {
    // No clustering — render raw markers (use sparingly)
    return <>{markerElements}</>;
  }

  return (
    <MarkerClusterGroup
      chunkedLoading
      maxClusterRadius={50}
      iconCreateFunction={createClusterIcon}
      spiderfyOnMaxZoom
      showCoverageOnHover={false}
      disableClusteringAtZoom={18}
    >
      {markerElements}
    </MarkerClusterGroup>
  );
}
