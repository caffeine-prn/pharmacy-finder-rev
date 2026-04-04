"use client";

import { useMap } from "react-leaflet";
import { useCallback, useState } from "react";
import {
  Plus,
  Minus,
  Crosshair,
  SquaresFour,
} from "@phosphor-icons/react";
import { usePharmacyStore } from "@/lib/store";
import { Button } from "@/components/ui/Button";

export function MapControls() {
  const map = useMap();
  const { isDenseView, toggleDenseView, setMapCenter, setMapZoom } =
    usePharmacyStore();
  const [locating, setLocating] = useState(false);

  const handleZoomIn = useCallback(() => map.zoomIn(), [map]);
  const handleZoomOut = useCallback(() => map.zoomOut(), [map]);

  const handleLocate = useCallback(() => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.flyTo([latitude, longitude], 15, { duration: 1.2 });
        setMapCenter([latitude, longitude]);
        setMapZoom(15);
        setLocating(false);
      },
      (err) => {
        console.error("Geolocation error:", err);
        setLocating(false);
        alert("위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [map, setMapCenter, setMapZoom]);

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
        variant="secondary"
        size="sm"
        icon={
          <Crosshair
            size={16}
            weight="bold"
            className={locating ? "animate-pulse text-emerald-600" : ""}
          />
        }
        onClick={handleLocate}
        aria-label="내 위치"
        className="!rounded-lg !p-2 shadow-md"
      />
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
