// frontend/src/components/table/PharmacyTable.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CaretUp,
  CaretDown,
  ArrowSquareOut,
  DownloadSimple,
} from "@phosphor-icons/react";
import { usePharmacyStore } from "@/lib/store";
import type { PharmacyTableRow, PaginatedResponse, SortField } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { TablePagination } from "./TablePagination";
import Link from "next/link";

const PAGE_SIZE = 50;

function displayDate(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function displayOpenDate(row: PharmacyTableRow) {
  return displayDate(row.mois_license_date || row.hira_open_date || row.open_date);
}

function displayAddress(row: PharmacyTableRow) {
  return row.road_address || row.address || "-";
}

function displayDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactYkiho(ykiho: string | null) {
  if (!ykiho) return "";
  if (ykiho.length <= 18) return ykiho;
  return `${ykiho.slice(0, 8)}...${ykiho.slice(-6)}`;
}

export function PharmacyTable() {
  const {
    filters,
    sortField,
    sortDirection,
    setSort,
    page,
    setPage,
    setView,
    setSelectedPharmacyId,
  } = usePharmacyStore();

  const [data, setData] = useState<PharmacyTableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch table data from API route
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sortField,
        sortDirection,
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.sido) params.set("sido", filters.sido);
      if (filters.sigungu) params.set("sigungu", filters.sigungu);
      if (filters.herbal) params.set("herbal", "true");
      if (filters.animal) params.set("animal", "true");
      if (filters.cross) params.set("cross", "true");
      if (filters.noYkiho) params.set("noYkiho", "true");
      if (filters.openedFrom) params.set("openedFrom", filters.openedFrom);
      if (filters.openedTo) params.set("openedTo", filters.openedTo);

      const res = await fetch(`/api/pharmacies?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: PaginatedResponse<PharmacyTableRow> = await res.json();
      setData(json.data);
      setTotal(json.total);
    } catch (err) {
      console.error("Table fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, sortField, sortDirection, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Sort header renderer
  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const isActive = sortField === field;
    return (
      <th
        className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-700 select-none"
        onClick={() => setSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive && (
            sortDirection === "asc" ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />
          )}
        </span>
      </th>
    );
  }

  // Focus pharmacy on map
  function handleFocusOnMap(row: PharmacyTableRow) {
    setSelectedPharmacyId(row.id);
    setView("map");
  }

  // CSV export
  async function handleExportCSV() {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "30000", // Export all
      sortField,
      sortDirection,
    });
    if (filters.search) params.set("search", filters.search);
    if (filters.sido) params.set("sido", filters.sido);
    if (filters.sigungu) params.set("sigungu", filters.sigungu);
    if (filters.herbal) params.set("herbal", "true");
    if (filters.animal) params.set("animal", "true");
    if (filters.cross) params.set("cross", "true");
    if (filters.noYkiho) params.set("noYkiho", "true");
    if (filters.openedFrom) params.set("openedFrom", filters.openedFrom);
    if (filters.openedTo) params.set("openedTo", filters.openedTo);

    try {
      const res = await fetch(`/api/pharmacies?${params}`);
      const json: PaginatedResponse<PharmacyTableRow> = await res.json();

      const headers = [
        "약국명",
        "개업일",
        "요양기관번호",
        "주소",
        "전화번호",
        "시도",
        "시군구",
        "약사",
        "한약사",
        "인력조회기준",
        "동물약국",
        "한약사약국",
        "교차고용",
      ];
      const rows = json.data.map((r) => [
        r.name,
        displayOpenDate(r),
        r.ykiho || "",
        displayAddress(r),
        r.phone || "",
        r.sido || "",
        r.sigungu || "",
        r.pharmacist_count,
        r.herbal_pharmacist_count,
        r.hira_staff_fetched_at || "",
        r.is_animal_pharmacy ? "O" : "",
        r.is_herbal_pharmacy ? "O" : "",
        r.is_cross_employed ? "O" : "",
      ]);

      const BOM = "\uFEFF";
      const csv = BOM + [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pharmacies_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100">
        <p className="text-sm text-zinc-500">
          총 <span className="font-mono font-semibold text-zinc-700">{total.toLocaleString()}</span>개 약국
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon={<DownloadSimple size={14} />}
          onClick={handleExportCSV}
        >
          CSV 내보내기
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto pb-24">
        <table className="w-full min-w-[1120px] table-mobile">
          <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200">
            <tr>
              <SortHeader field="name" label="약국명" />
              <SortHeader field="open_date" label="개업일" />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">요양기관번호</th>
              {/* sticky first column handled by CSS for mobile */}
              <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">주소</th>
              <SortHeader field="sido" label="지역" />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">인력 구성</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">구분</th>
              <th className="px-3 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-0 py-0">
                    <SkeletonRow />
                  </td>
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-zinc-400 text-sm">
                  조건에 맞는 약국이 없습니다.
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-zinc-50 cursor-pointer transition-colors"
                  onClick={() => handleFocusOnMap(row)}
                >
                  <td className="px-3 py-2.5 text-sm font-medium text-zinc-900 whitespace-nowrap">
                    <div className="max-w-[180px]">
                      <p className="truncate">{row.name}</p>
                      {row.phone && (
                        <p className="mt-0.5 font-mono text-[11px] font-normal text-zinc-400">
                          {row.phone}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-700 whitespace-nowrap font-mono">
                    {displayOpenDate(row)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.ykiho ? (
                      <span
                        title={row.ykiho}
                        className="inline-flex rounded-md bg-emerald-50 px-2 py-1 font-mono text-[11px] font-medium text-emerald-700"
                      >
                        {compactYkiho(row.ykiho)}
                      </span>
                    ) : (
                      <Badge variant="noYkiho">요양X</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-600 max-w-[240px] truncate">
                    <span title={displayAddress(row)}>{displayAddress(row)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-600 whitespace-nowrap">
                    {row.sido} {row.sigungu}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                          약사 <b className="font-mono">{row.pharmacist_count || 0}</b>
                        </span>
                        <span className={`rounded-md px-2 py-1 text-xs ${
                          row.herbal_pharmacist_count > 0
                            ? "bg-rose-50 text-rose-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}>
                          한약사 <b className="font-mono">{row.herbal_pharmacist_count || 0}</b>
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        {row.hira_staff_fetched_at
                          ? `조회 기준 ${displayDateTime(row.hira_staff_fetched_at)}`
                          : "CSV/기본 데이터 기준"}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {row.is_herbal_pharmacy && <Badge variant="herbal">한약</Badge>}
                      {row.is_animal_pharmacy && <Badge variant="animal">동물</Badge>}
                      {row.is_cross_employed && <Badge variant="cross">교차</Badge>}
                      {!row.has_ykiho && <Badge variant="noYkiho">요양X</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <Link
                      href={`/pharmacy/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-zinc-400 hover:text-emerald-600"
                    >
                      <ArrowSquareOut size={14} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <TablePagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
