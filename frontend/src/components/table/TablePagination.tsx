// frontend/src/components/table/TablePagination.tsx
"use client";

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";

interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({ page, totalPages, onPageChange }: TablePaginationProps) {
  if (totalPages <= 1) return null;

  // Generate page numbers to show
  function getPageNumbers(): (number | "...")[] {
    const pages: (number | "...")[] = [];
    const delta = 2;

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);

    if (page > delta + 2) pages.push("...");

    const start = Math.max(2, page - delta);
    const end = Math.min(totalPages - 1, page + delta);

    for (let i = start; i <= end; i++) pages.push(i);

    if (page < totalPages - delta - 1) pages.push("...");

    pages.push(totalPages);

    return pages;
  }

  return (
    <div className="flex items-center justify-center gap-1 border-t border-zinc-100 px-4 py-3 max-sm:pb-[calc(env(safe-area-inset-bottom)+4.75rem)]">
      <Button
        variant="ghost"
        size="sm"
        icon={<CaretLeft size={14} />}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 페이지"
      />

      {getPageNumbers().map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-2 text-xs text-zinc-400">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p as number)}
            className={`min-w-[32px] h-8 rounded-md text-sm font-medium transition-colors ${
              p === page
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {p}
          </button>
        )
      )}

      <Button
        variant="ghost"
        size="sm"
        icon={<CaretRight size={14} />}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="다음 페이지"
      />
    </div>
  );
}
