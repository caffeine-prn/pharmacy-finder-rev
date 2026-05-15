"use client";

import type { ReactNode } from "react";
import {
  CirclesThreePlus,
  Leaf,
  MapPin,
  PawPrint,
  Question,
  UsersFour,
} from "@phosphor-icons/react";
import { usePharmacyStore } from "@/lib/store";
import type { HeatmapMode, MarkerData } from "@/lib/types";

interface HeatmapModeControlProps {
  markers: MarkerData[];
}

const options: Array<{
  mode: HeatmapMode;
  label: string;
  shortLabel: string;
  className: string;
  icon: ReactNode;
}> = [
  {
    mode: "markers",
    label: "마커",
    shortLabel: "마커",
    className: "data-[active=true]:border-emerald-300 data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-700",
    icon: <MapPin size={14} />,
  },
  {
    mode: "herbal",
    label: "한약사 밀도",
    shortLabel: "한약사",
    className: "data-[active=true]:border-rose-300 data-[active=true]:bg-rose-50 data-[active=true]:text-rose-700",
    icon: <Leaf size={14} />,
  },
  {
    mode: "animal",
    label: "동물약국 밀도",
    shortLabel: "동물",
    className: "data-[active=true]:border-orange-300 data-[active=true]:bg-orange-50 data-[active=true]:text-orange-700",
    icon: <PawPrint size={14} />,
  },
  {
    mode: "cross",
    label: "교차고용 밀도",
    shortLabel: "교차",
    className: "data-[active=true]:border-violet-300 data-[active=true]:bg-violet-50 data-[active=true]:text-violet-700",
    icon: <UsersFour size={14} />,
  },
  {
    mode: "noYkiho",
    label: "요양X 밀도",
    shortLabel: "요양X",
    className: "data-[active=true]:border-zinc-300 data-[active=true]:bg-zinc-100 data-[active=true]:text-zinc-800",
    icon: <Question size={14} />,
  },
];

function countForMode(markers: MarkerData[], mode: HeatmapMode) {
  if (mode === "markers") return markers.length;
  if (mode === "herbal") return markers.filter((marker) => marker.h).length;
  if (mode === "animal") return markers.filter((marker) => marker.a).length;
  if (mode === "cross") return markers.filter((marker) => marker.c).length;
  return markers.filter((marker) => !marker.y).length;
}

export function HeatmapModeControl({ markers }: HeatmapModeControlProps) {
  const { heatmapMode, setHeatmapMode } = usePharmacyStore();
  const activeCount = countForMode(markers, heatmapMode);

  return (
    <div className="absolute left-3 top-[8.9rem] z-[1000] flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 overflow-x-auto rounded-xl border border-zinc-200 bg-white/95 p-1.5 shadow-md backdrop-blur-sm max-sm:left-2 max-sm:right-2 max-sm:top-[8.6rem] max-sm:max-w-none" style={{ scrollbarWidth: "none" }}>
      <div className="mr-1 hidden items-center gap-1.5 px-1.5 text-[11px] font-semibold text-zinc-500 sm:flex">
        <CirclesThreePlus size={14} />
        밀도
      </div>
      {options.map((option) => {
        const active = heatmapMode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            data-active={active}
            onClick={() => setHeatmapMode(option.mode)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors active:scale-[0.98] ${
              active
                ? option.className
                : "border-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
            }`}
            title={option.label}
            aria-pressed={active}
          >
            {option.icon}
            <span className="sm:hidden">{option.shortLabel}</span>
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
      <div className="ml-1 hidden whitespace-nowrap rounded-md bg-zinc-50 px-2 py-1 font-mono text-[11px] text-zinc-500 md:block">
        {activeCount.toLocaleString()} / {markers.length.toLocaleString()}
      </div>
    </div>
  );
}
