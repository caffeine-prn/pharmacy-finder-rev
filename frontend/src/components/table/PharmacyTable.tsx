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

    try {
      const res = await fetch(`/api/pharmacies?${params}`);
      const json: PaginatedResponse<PharmacyTableRow> = await res.json();

      const headers = ["약국명", "주소", "전화번호", "시도", "시군구", "약사", "한약사", "동물약국", "한약사약국", "교차고용", "요양기관"];
      const rows = json.data.map((r) => [
        r.name,
        r.address || "",
        r.phone || "",
        r.sido || "",
        r.sigungu || "",
        r.pharmacist_count,
        r.herbal_pharmacist_count,
        r.is_animal_pharmacy ? "O" : "",
        r.is_herbal_pharmacy ? "O" : "",
        r.is_cross_employed ? "O" : "",
        r.has_ykiho ? "O" : "X",
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
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[800px]">
          <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-200">
            <tr>
              <SortHeader field="name" label="약국명" />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">주소</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">전화번호</th>
              <SortHeader field="sido" label="시도" />
              <SortHeader field="sigungu" label="시군구" />
              <SortHeader field="pharmacist_count" label="약사" />
              <SortHeader field="herbal_pharmacist_count" label="한약사" />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">구분</th>
              <th className="px-3 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9} className="px-0 py-0">
                    <SkeletonRow />
                  </td>
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-zinc-400 text-sm">
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
                    {row.name}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-600 max-w-[240px] truncate">
                    {row.address}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-600 whitespace-nowrap font-mono text-xs">
                    {row.phone}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-600 whitespace-nowrap">
                    {row.sido}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-600 whitespace-nowrap">
                    {row.sigungu}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-700 font-mono text-center">
                    {row.pharmacist_count || "-"}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-zinc-700 font-mono text-center">
                    {row.herbal_pharmacist_count || "-"}
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
