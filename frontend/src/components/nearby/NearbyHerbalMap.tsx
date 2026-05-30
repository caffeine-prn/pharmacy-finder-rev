"use client";

import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPinArea } from "@phosphor-icons/react";
import { MarkerLayer } from "@/components/map/MarkerLayer";
import type { MarkerData } from "@/lib/types";

interface NearbyHerbalMapProps {
  markers: MarkerData[];
  allHerbalMarkers: MarkerData[];
  userLocation: [number, number] | null;
  radiusKm: number;
}

function NearbyMapFocus({
  markers,
  userLocation,
  radiusKm,
}: Pick<NearbyHerbalMapProps, "markers" | "userLocation" | "radiusKm">) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
  }, [map]);

  useEffect(() => {
    if (!userLocation) {
      map.flyTo([37.5665, 126.978], 7, { duration: 0.8 });
      return;
    }

    if (markers.length > 0) {
      const bounds = L.latLngBounds([
        [userLocation[0], userLocation[1]],
        ...markers.map((marker) => [marker.lat, marker.lng] as [number, number]),
      ]);
      map.fitBounds(bounds.pad(0.24), { animate: true, duration: 0.8, maxZoom: 15 });
      return;
    }

    map.flyTo(userLocation, radiusKm <= 1 ? 15 : radiusKm <= 3 ? 14 : 12, { duration: 0.8 });
  }, [map, markers, radiusKm, userLocation]);

  return null;
}

export function NearbyHerbalMap({
  markers,
  allHerbalMarkers,
  userLocation,
  radiusKm,
}: NearbyHerbalMapProps) {
  const previewMarkers = userLocation ? markers : allHerbalMarkers.slice(0, 220);

  return (
    <div className="relative h-full min-h-[28rem] overflow-hidden rounded-[1.45rem]">
      <MapContainer
        center={[37.5665, 126.978]}
        zoom={7}
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
        <NearbyMapFocus markers={markers} userLocation={userLocation} radiusKm={radiusKm} />
        {userLocation && (
          <>
            <Circle
              center={userLocation}
              radius={radiusKm * 1000}
              pathOptions={{
                color: "#047857",
                fillColor: "#10b981",
                fillOpacity: 0.08,
                opacity: 0.36,
                weight: 1.5,
              }}
            />
            <CircleMarker
              center={userLocation}
              radius={7}
              pathOptions={{
                color: "#ffffff",
                fillColor: "#047857",
                fillOpacity: 1,
                opacity: 1,
                weight: 3,
              }}
            />
          </>
        )}
        <MarkerLayer markers={previewMarkers} />
      </MapContainer>

      {!userLocation && (
        <div className="pointer-events-none absolute left-4 top-4 max-w-[18rem] rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur-md">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <MapPinArea size={18} weight="bold" />
          </div>
          <p className="text-sm font-black text-zinc-950">위치를 허용하면 지도가 재정렬됩니다</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            지금은 전국 한약사·한약국 후보 일부를 미리 보여주고 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
