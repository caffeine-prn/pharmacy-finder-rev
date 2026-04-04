"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { usePharmacyStore } from "@/lib/store";

const SIDO_LIST = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

export function SearchPanel() {
  const { filters, setSearch, setSido, setSigungu, markers } = usePharmacyStore();
  const [inputValue, setInputValue] = useState(filters.search);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue, setSearch]);

  // Extract sigungu list from loaded markers for selected sido
  const sigunguList = useMemo(() => {
    if (!filters.sido) return [];
    const set = new Set<string>();
    markers.forEach((m) => {
      if (m.s === filters.sido && m.g) set.add(m.g);
    });
    return Array.from(set).sort();
  }, [markers, filters.sido]);

  const handleClear = useCallback(() => {
    setInputValue("");
    setSearch("");
  }, [setSearch]);

  return (
    <div className="absolute left-3 top-3 z-[1000] flex flex-col gap-2 w-72">
      {/* Search input */}
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md border border-zinc-200 flex items-center px-3 py-2 gap-2">
        <MagnifyingGlass size={18} className="text-zinc-400 flex-shrink-0" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="약국명 또는 전화번호 검색"
          className="flex-1 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none"
        />
        {inputValue && (
          <button onClick={handleClear} className="text-zinc-400 hover:text-zinc-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Region dropdowns */}
      <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md border border-zinc-200 flex gap-2 px-3 py-2">
        <select
          value={filters.sido}
          onChange={(e) => setSido(e.target.value)}
          className="flex-1 text-sm bg-transparent text-zinc-700 outline-none cursor-pointer"
        >
          <option value="">전체 시도</option>
          {SIDO_LIST.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="w-px bg-zinc-200" />
        <select
          value={filters.sigungu}
          onChange={(e) => setSigungu(e.target.value)}
          className="flex-1 text-sm bg-transparent text-zinc-700 outline-none cursor-pointer"
          disabled={!filters.sido}
        >
          <option value="">전체 시군구</option>
          {sigunguList.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
