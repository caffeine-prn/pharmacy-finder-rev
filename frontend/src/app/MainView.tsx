"use client";

import dynamic from "next/dynamic";
import { usePharmacyStore } from "@/lib/store";
import { ViewTabs } from "@/components/ViewTabs";
import { SearchPanel } from "@/components/panels/SearchPanel";
import { FilterBar } from "@/components/panels/FilterBar";
import { PharmacySlidePanel } from "@/components/panels/PharmacySlidePanel";
import { Skeleton } from "@/components/ui/Skeleton";

// Dynamic imports to avoid SSR issues
const PharmacyMap = dynamic(
  () => import("@/components/map/PharmacyMap").then((m) => m.PharmacyMap),
  {
    ssr: false,
    loading: () => <Skeleton className="flex-1" />,
  }
);

const PharmacyTable = dynamic(
  () => import("@/components/table/PharmacyTable").then((m) => m.PharmacyTable),
  {
    ssr: false,
    loading: () => <Skeleton className="flex-1" />,
  }
);

export function MainView() {
  const { view } = usePharmacyStore();

  return (
    <div className="flex-1 relative flex flex-col overflow-hidden">
      {view === "map" ? (
        <>
          <PharmacyMap />
          <SearchPanel />
          <FilterBar />
          <PharmacySlidePanel />
        </>
      ) : (
        <>
          {/* Table view has its own inline search/filter bar */}
          <div className="bg-white border-b border-zinc-200 px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <TableSearchFilters />
          </div>
          <PharmacyTable />
        </>
      )}
      <ViewTabs />
    </div>
  );
}

/** Inline search and filter controls for table view */
function TableSearchFilters() {
  const {
    filters,
    setSearch,
    setSido,
    setSigungu,
    toggleHerbal,
    toggleAnimal,
    toggleCross,
    toggleNoYkiho,
    markers,
  } = usePharmacyStore();

  const SIDO_LIST = [
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
    "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
  ];

  const sigunguList = filters.sido
    ? Array.from(new Set(markers.filter((m) => m.s === filters.sido).map((m) => m.g))).sort()
    : [];

  return (
    <>
      <input
        type="text"
        value={filters.search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="약국명 검색"
        className="border border-zinc-200 rounded-md px-2.5 py-1.5 text-sm w-48 outline-none focus:border-emerald-400"
      />
      <select
        value={filters.sido}
        onChange={(e) => setSido(e.target.value)}
        className="border border-zinc-200 rounded-md px-2 py-1.5 text-sm outline-none"
      >
        <option value="">전체 시도</option>
        {SIDO_LIST.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select
        value={filters.sigungu}
        onChange={(e) => setSigungu(e.target.value)}
        className="border border-zinc-200 rounded-md px-2 py-1.5 text-sm outline-none"
        disabled={!filters.sido}
      >
        <option value="">전체 시군구</option>
        {sigunguList.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
      <div className="h-5 w-px bg-zinc-200" />
      {[
        { key: "herbal" as const, label: "한약사", toggle: toggleHerbal },
        { key: "animal" as const, label: "동물약국", toggle: toggleAnimal },
        { key: "cross" as const, label: "교차고용", toggle: toggleCross },
        { key: "noYkiho" as const, label: "요양X", toggle: toggleNoYkiho },
      ].map(({ key, label, toggle }) => (
        <button
          key={key}
          onClick={toggle}
          className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
            filters[key]
              ? "bg-zinc-900 text-white border-zinc-900"
              : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"
          }`}
        >
          {label}
        </button>
      ))}
    </>
  );
}
