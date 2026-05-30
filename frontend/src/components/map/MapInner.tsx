// frontend/src/components/map/MapInner.tsx
// This file is ONLY ever loaded client-side (imported via dynamic({ ssr: false }))
"use client";

import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import { usePharmacyStore } from "@/lib/store";
import type { MarkerData } from "@/lib/types";
import { MarkerLayer } from "./MarkerLayer";
import { MapControls } from "./MapControls";

interface MapInnerProps {
  filteredMarkers: MarkerData[];
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const resize = () => map.invalidateSize();
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [map]);

  return null;
}

function UserLocationOverlay() {
  const { userLocation, filters } = usePharmacyStore();
  if (!userLocation) return null;

  return (
    <>
      <Circle
        center={userLocation}
        radius={filters.nearby ? 3000 : 120}
        pathOptions={{
          color: filters.nearby ? "#059669" : "#2563eb",
          fillColor: filters.nearby ? "#10b981" : "#60a5fa",
          fillOpacity: filters.nearby ? 0.08 : 0.12,
          opacity: filters.nearby ? 0.35 : 0.25,
          weight: 1.5,
        }}
      />
      <CircleMarker
        center={userLocation}
        radius={7}
        pathOptions={{
          color: "#ffffff",
          fillColor: "#2563eb",
          fillOpacity: 1,
          opacity: 1,
          weight: 3,
        }}
      />
    </>
  );
}

export function MapInner({ filteredMarkers }: MapInnerProps) {
  const { mapCenter, mapZoom } = usePharmacyStore();

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      className="h-full w-full z-0"
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
      preferCanvas
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={18}
      />
      <MapResizeHandler />
      <UserLocationOverlay />
      <MarkerLayer markers={filteredMarkers} />
      <MapControls />
    </MapContainer>
  );
}
