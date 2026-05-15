"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import type { HeatmapMode, MarkerData } from "@/lib/types";

interface HeatmapLayerProps {
  markers: MarkerData[];
  mode: Exclude<HeatmapMode, "markers">;
}

const gradientByMode: Record<Exclude<HeatmapMode, "markers">, Record<number, string>> = {
  herbal: {
    0.2: "#fecdd3",
    0.45: "#fb7185",
    0.7: "#e11d48",
    1.0: "#881337",
  },
  animal: {
    0.2: "#fed7aa",
    0.45: "#fb923c",
    0.7: "#ea580c",
    1.0: "#9a3412",
  },
  cross: {
    0.2: "#ddd6fe",
    0.45: "#a78bfa",
    0.7: "#7c3aed",
    1.0: "#4c1d95",
  },
  noYkiho: {
    0.2: "#d4d4d8",
    0.45: "#a1a1aa",
    0.7: "#52525b",
    1.0: "#18181b",
  },
};

function matchesMode(marker: MarkerData, mode: Exclude<HeatmapMode, "markers">) {
  if (mode === "herbal") return marker.h;
  if (mode === "animal") return marker.a;
  if (mode === "cross") return marker.c;
  return !marker.y;
}

export function HeatmapLayer({ markers, mode }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    const points: L.HeatLatLngTuple[] = markers
      .filter((marker) => matchesMode(marker, mode))
      .map((marker) => [marker.lat, marker.lng, 0.85]);

    const layer = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 13,
      minOpacity: 0.28,
      gradient: gradientByMode[mode],
    });

    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, markers, mode]);

  return null;
}
