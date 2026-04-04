// frontend/src/components/map/MapInner.tsx
// This file is ONLY ever loaded client-side (imported via dynamic({ ssr: false }))
"use client";

import { MapContainer, TileLayer } from "react-leaflet";
import { usePharmacyStore } from "@/lib/store";
import type { MarkerData } from "@/lib/types";
import { MarkerLayer } from "./MarkerLayer";

interface MapInnerProps {
  filteredMarkers: MarkerData[];
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
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={18}
      />
      <MarkerLayer markers={filteredMarkers} />
    </MapContainer>
  );
}
