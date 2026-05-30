"use client";

import { useMap } from "react-leaflet";
import { useCallback, useState } from "react";
import {
  Plus,
  Minus,
  SquaresFour,
  MapPinArea,
} from "@phosphor-icons/react";
import { usePharmacyStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";

export function MapControls() {
  const map = useMap();
  const { filters, isDenseView, toggleDenseView, setMapCenter, setMapZoom, setUserLocation, setNearbyFilter } =
    usePharmacyStore();
  const [locating, setLocating] = useState(false);

  const handleZoomIn = useCallback(() => map.zoomIn(), [map]);
  const handleZoomOut = useCallback(() => map.zoomOut(), [map]);

  const handleNearby = useCallback(() => {
    if (filters.nearby) {
      setNearbyFilter(false);
      setUserLocation(null);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.flyTo([latitude, longitude], 14, { duration: 1.2 });
        setMapCenter([latitude, longitude]);
        setMapZoom(14);
        setUserLocation([latitude, longitude]);
        setNearbyFilter(true);
        setLocating(false);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setLocating(false);
        alert("위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [filters.nearby, map, setMapCenter, setMapZoom, setNearbyFilter, setUserLocation]);

  return (
    <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5 max-sm:top-auto max-sm:bottom-20 max-sm:right-2">
      <Button
        variant="secondary"
        size="sm"
        icon={<Plus size={16} weight="bold" />}
        onClick={handleZoomIn}
        aria-label="확대"
        className="!rounded-lg !p-2 shadow-md"
      />
      <Button
        variant="secondary"
        size="sm"
        icon={<Minus size={16} weight="bold" />}
        onClick={handleZoomOut}
        aria-label="축소"
        className="!rounded-lg !p-2 shadow-md"
      />
      <div className="h-px" />
      <Button
        variant={filters.nearby ? "primary" : "secondary"}
        size="sm"
        icon={
          <MapPinArea
            size={16}
            weight={filters.nearby ? "fill" : "bold"}
            className={locating ? "animate-pulse" : ""}
          />
        }
        onClick={handleNearby}
        aria-label={filters.nearby ? "내 주변 살펴보기 해제" : "내 주변 살펴보기"}
        title={filters.nearby ? "내 주변 살펴보기 해제" : "내 주변 살펴보기"}
        className="!rounded-lg !px-2.5 !py-2 shadow-md"
      >
        <span className="text-[11px] font-semibold leading-none max-sm:hidden">내 주변</span>
      </Button>
      <Button
        variant={isDenseView ? "primary" : "secondary"}
        size="sm"
        icon={<SquaresFour size={16} weight="bold" />}
        onClick={toggleDenseView}
        aria-label="촘촘히 보기"
        className="!rounded-lg !p-2 shadow-md"
      />
    </div>
  );
}
