"use client";

import dynamic from "next/dynamic";
import { usePharmacyStore } from "@/lib/store";
import { ViewTabs } from "@/components/ViewTabs";
import { SearchPanel } from "@/components/panels/SearchPanel";
import { FilterBar } from "@/components/panels/FilterBar";
import { PharmacySlidePanel } from "@/components/panels/PharmacySlidePanel";
import { Skeleton } from "@/components/ui/Skeleton";
import Link from "next/link";

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

function dateNDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

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
          <div className="table-filter-toolbar flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 sm:pr-40 max-sm:flex-col max-sm:items-stretch max-sm:gap-2 max-sm:px-3 max-sm:py-2">
            <TableSearchFilters />
            <div className="table-filter-links ml-auto flex items-center gap-2 text-xs font-medium max-sm:ml-0 max-sm:w-[calc(100vw-1.5rem)] max-sm:justify-end max-sm:pr-1">
              <Link href="/about" className="text-zinc-500 hover:text-zinc-900">
                서비스 안내
              </Link>
              <Link href="/log" className="text-emerald-700 hover:text-emerald-900">
                데이터 로그
              </Link>
            </div>
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
    setOpenedFrom,
    setOpenedTo,
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
    <div className="table-filter-controls flex flex-1 flex-wrap items-center gap-3 max-sm:w-[calc(100vw-1.5rem)] max-sm:max-w-[calc(100vw-1.5rem)] max-sm:flex-none max-sm:flex-col max-sm:items-stretch max-sm:gap-2 max-sm:overflow-hidden">
      <input
        type="text"
        value={filters.search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="약국명 검색"
        className="w-48 rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-400 max-sm:h-10 max-sm:w-full"
      />
      <div className="flex items-center gap-2 max-sm:w-full max-sm:min-w-0">
        <select
          value={filters.sido}
          onChange={(e) => setSido(e.target.value)}
          className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm outline-none max-sm:h-10 max-sm:min-w-0 max-sm:flex-1"
        >
          <option value="">전체 시도</option>
          {SIDO_LIST.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filters.sigungu}
          onChange={(e) => setSigungu(e.target.value)}
          className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm outline-none max-sm:h-10 max-sm:min-w-0 max-sm:flex-1"
          disabled={!filters.sido}
        >
          <option value="">전체 시군구</option>
          {sigunguList.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>
      <div className="h-5 w-px bg-zinc-200 max-sm:hidden" />
      <div className="table-date-filter flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-500 max-sm:w-full max-sm:min-w-0 max-sm:overflow-x-auto max-sm:py-1.5">
        <span className="shrink-0 font-semibold text-zinc-700">개업일</span>
        <span className="shrink-0">이후</span>
        <input
          type="date"
          value={filters.openedFrom}
          onChange={(e) => setOpenedFrom(e.target.value)}
          aria-label="개업일 이후"
          className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400 max-sm:h-9"
        />
        <span className="shrink-0">이전</span>
        <input
          type="date"
          value={filters.openedTo}
          onChange={(e) => setOpenedTo(e.target.value)}
          aria-label="개업일 이전"
          className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-400 max-sm:h-9"
        />
        <button
          type="button"
          onClick={() => {
            setOpenedFrom(dateNDaysAgo(30));
            setOpenedTo("");
          }}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 font-medium text-zinc-600 hover:bg-zinc-100 max-sm:h-9 max-sm:shrink-0"
        >
          최근 30일
        </button>
        {(filters.openedFrom || filters.openedTo) && (
          <button
            type="button"
            onClick={() => {
              setOpenedFrom("");
              setOpenedTo("");
            }}
            className="rounded-md px-2 py-1.5 font-medium text-zinc-400 hover:bg-white hover:text-zinc-600 max-sm:h-9 max-sm:shrink-0"
          >
            해제
          </button>
        )}
      </div>
      <div className="h-5 w-px bg-zinc-200 max-sm:hidden" />
      <div className="table-toggle-grid flex items-center gap-1.5 max-sm:grid max-sm:w-full max-sm:min-w-0 max-sm:grid-cols-2">
        {[
          { key: "herbal" as const, label: "한약사", toggle: toggleHerbal },
          { key: "animal" as const, label: "동물약국", toggle: toggleAnimal },
          { key: "cross" as const, label: "교차고용", toggle: toggleCross },
          { key: "noYkiho" as const, label: "요양X", toggle: toggleNoYkiho },
        ].map(({ key, label, toggle }) => (
          <button
            key={key}
            onClick={toggle}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors max-sm:h-9 max-sm:min-w-0 max-sm:truncate ${
              filters[key]
                ? "bg-zinc-900 text-white border-zinc-900"
                : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
