"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { MapTrifold, Table } from "@phosphor-icons/react";
import { usePharmacyStore } from "@/lib/store";

export function ViewTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { view, setView } = usePharmacyStore();

  // Sync URL param → store on mount
  useEffect(() => {
    const urlView = searchParams.get("view");
    if (urlView === "map" || urlView === "table") {
      setView(urlView);
    }
  }, [searchParams, setView]);

  // Update URL when view changes
  function handleViewChange(newView: "map" | "table") {
    setView(newView);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", newView);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div
      className={`absolute z-[1000] ${
        view === "table"
          ? "right-4 top-2 max-sm:right-3 max-sm:top-2"
          : "bottom-6 left-1/2 -translate-x-1/2 max-sm:bottom-4"
      }`}
    >
      <div className="flex bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-zinc-200 p-1">
        <button
          onClick={() => handleViewChange("map")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
            view === "map"
              ? "bg-zinc-900 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <MapTrifold size={16} weight={view === "map" ? "fill" : "regular"} />
          지도
        </button>
        <button
          onClick={() => handleViewChange("table")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
            view === "table"
              ? "bg-zinc-900 text-white shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <Table size={16} weight={view === "table" ? "fill" : "regular"} />
          테이블
        </button>
      </div>
    </div>
  );
}
