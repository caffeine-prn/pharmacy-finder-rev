"use client";

import { usePharmacyStore } from "@/lib/store";
import {
  CalendarBlank,
  Leaf,
  PawPrint,
  UsersFour,
  Question,
} from "@phosphor-icons/react";

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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150 border cursor-pointer ${
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

  return (
    <div className="absolute left-3 top-[7.5rem] z-[1000] flex max-w-[calc(100%-1.5rem)] gap-1.5 overflow-x-auto pb-1 max-sm:left-2 max-sm:right-2 max-sm:max-w-none max-sm:flex-nowrap max-sm:scrollbar-none" style={{ scrollbarWidth: "none" }}>
      <FilterPill
        active={filters.herbal}
        onClick={toggleHerbal}
        icon={<Leaf size={14} weight={filters.herbal ? "fill" : "regular"} />}
        label="한약사"
        activeColor="bg-rose-50 text-rose-700 border-rose-300"
      />
      <FilterPill
        active={filters.animal}
        onClick={toggleAnimal}
        icon={<PawPrint size={14} weight={filters.animal ? "fill" : "regular"} />}
        label="동물약국"
        activeColor="bg-orange-50 text-orange-700 border-orange-300"
      />
      <FilterPill
        active={filters.cross}
        onClick={toggleCross}
        icon={<UsersFour size={14} weight={filters.cross ? "fill" : "regular"} />}
        label="교차고용"
        activeColor="bg-violet-50 text-violet-700 border-violet-300"
      />
      <FilterPill
        active={filters.noYkiho}
        onClick={toggleNoYkiho}
        icon={<Question size={14} weight={filters.noYkiho ? "fill" : "regular"} />}
        label="요양X"
        activeColor="bg-zinc-100 text-zinc-700 border-zinc-300"
      />
      <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-white/95 px-2 py-1 text-xs text-zinc-600 shadow-sm">
        <CalendarBlank size={14} />
        <input
          type="date"
          value={filters.openedFrom}
          onChange={(e) => setOpenedFrom(e.target.value)}
          aria-label="개업일 시작"
          className="w-[7.7rem] bg-transparent text-xs outline-none"
        />
        <span className="text-zinc-300">~</span>
        <input
          type="date"
          value={filters.openedTo}
          onChange={(e) => setOpenedTo(e.target.value)}
          aria-label="개업일 종료"
          className="w-[7.7rem] bg-transparent text-xs outline-none"
        />
      </div>
    </div>
  );
}
