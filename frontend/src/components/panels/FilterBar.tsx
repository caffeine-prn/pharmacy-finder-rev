"use client";

import { usePharmacyStore } from "@/lib/store";
import {
  CalendarBlank,
  Leaf,
  PawPrint,
  UsersFour,
  Question,
} from "@phosphor-icons/react";
import { trackAnalyticsEvent } from "@/lib/analytics";

interface FilterPillProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
}

function FilterPill({ active, onClick, icon, label, activeColor }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer max-sm:min-h-9 ${
        active
          ? `${activeColor} shadow-sm`
          : "bg-white/95 text-zinc-600 border-zinc-200 hover:bg-zinc-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function dateNDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function FilterBar() {
  const {
    filters,
    toggleHerbal,
    toggleAnimal,
    toggleCross,
    toggleNoYkiho,
    setOpenedFrom,
    setOpenedTo,
  } =
    usePharmacyStore();

  const hasOpenedFilter = Boolean(filters.openedFrom || filters.openedTo);
  const trackFilter = (filter: string, enabled: boolean) => {
    trackAnalyticsEvent({
      eventName: "filter_toggle",
      view: "map",
      metadata: { filter, enabled },
    });
  };

  return (
    <div className="absolute left-3 top-[7.5rem] z-[1000] flex max-w-[calc(100%-1.5rem)] gap-1.5 overflow-x-auto pb-1 max-sm:left-2 max-sm:right-2 max-sm:max-w-none max-sm:flex-nowrap max-sm:scrollbar-none" style={{ scrollbarWidth: "none" }}>
      <FilterPill
        active={filters.herbal}
        onClick={() => {
          trackFilter("herbal", !filters.herbal);
          toggleHerbal();
        }}
        icon={<Leaf size={14} weight={filters.herbal ? "fill" : "regular"} />}
        label="한약사"
        activeColor="bg-rose-50 text-rose-700 border-rose-300"
      />
      <FilterPill
        active={filters.animal}
        onClick={() => {
          trackFilter("animal", !filters.animal);
          toggleAnimal();
        }}
        icon={<PawPrint size={14} weight={filters.animal ? "fill" : "regular"} />}
        label="동물약국"
        activeColor="bg-orange-50 text-orange-700 border-orange-300"
      />
      <FilterPill
        active={filters.cross}
        onClick={() => {
          trackFilter("cross", !filters.cross);
          toggleCross();
        }}
        icon={<UsersFour size={14} weight={filters.cross ? "fill" : "regular"} />}
        label="교차고용"
        activeColor="bg-violet-50 text-violet-700 border-violet-300"
      />
      <FilterPill
        active={filters.noYkiho}
        onClick={() => {
          trackFilter("noYkiho", !filters.noYkiho);
          toggleNoYkiho();
        }}
        icon={<Question size={14} weight={filters.noYkiho ? "fill" : "regular"} />}
        label="요양X"
        activeColor="bg-zinc-100 text-zinc-700 border-zinc-300"
      />
      <div
        className={`inline-flex shrink-0 items-center gap-2 rounded-xl border bg-white/95 px-3 py-2 text-xs shadow-sm max-sm:min-w-max ${
          hasOpenedFilter
            ? "border-emerald-300 text-emerald-800"
            : "border-zinc-200 text-zinc-600"
        }`}
      >
        <div className="flex items-center gap-1.5 font-semibold">
          <CalendarBlank size={14} weight={hasOpenedFilter ? "fill" : "regular"} />
          <span>개업일</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-400">이후</span>
          <input
            type="date"
            value={filters.openedFrom}
            onChange={(e) => {
              setOpenedFrom(e.target.value);
              trackAnalyticsEvent({
                eventName: "date_filter",
                view: "map",
                metadata: { field: "openedFrom", value: e.target.value },
              });
            }}
            aria-label="개업일 이후"
            className="w-[7.2rem] rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-700 outline-none focus:border-emerald-400"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-400">이전</span>
          <input
            type="date"
            value={filters.openedTo}
            onChange={(e) => {
              setOpenedTo(e.target.value);
              trackAnalyticsEvent({
                eventName: "date_filter",
                view: "map",
                metadata: { field: "openedTo", value: e.target.value },
              });
            }}
            aria-label="개업일 이전"
            className="w-[7.2rem] rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-700 outline-none focus:border-emerald-400"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setOpenedFrom(dateNDaysAgo(30));
            setOpenedTo("");
            trackAnalyticsEvent({
              eventName: "date_filter",
              view: "map",
              metadata: { preset: "recent_30_days" },
            });
          }}
          className="rounded-md bg-zinc-100 px-2 py-1 font-medium text-zinc-600 transition hover:bg-zinc-200"
        >
          최근 30일
        </button>
        {hasOpenedFilter && (
          <button
            type="button"
            onClick={() => {
              setOpenedFrom("");
              setOpenedTo("");
              trackAnalyticsEvent({
                eventName: "date_filter",
                view: "map",
                metadata: { cleared: true },
              });
            }}
            className="rounded-md px-2 py-1 font-medium text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            해제
          </button>
        )}
      </div>
    </div>
  );
}
