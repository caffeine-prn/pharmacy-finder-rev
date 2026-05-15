// frontend/src/components/map/MapInner.tsx
// This file is ONLY ever loaded client-side (imported via dynamic({ ssr: false }))
"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { usePharmacyStore } from "@/lib/store";
import type { MarkerData } from "@/lib/types";
import { MarkerLayer } from "./MarkerLayer";

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
      <MarkerLayer markers={filteredMarkers} />
    </MapContainer>
  );
}
