// frontend/src/components/pharmacy/StaffInfo.tsx
"use client";

import { Users } from "@phosphor-icons/react";
import type { Pharmacy } from "@/lib/types";

interface StaffInfoProps {
  pharmacy: Pharmacy;
}

export function StaffInfo({ pharmacy }: StaffInfoProps) {
  const { pharmacist_count, herbal_pharmacist_count } = pharmacy;
  if (!pharmacist_count && !herbal_pharmacist_count) return null;

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users size={18} className="text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-900">인력정보</h3>
      </div>
      <div className="flex gap-6">
        {pharmacist_count > 0 && (
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900 font-mono">{pharmacist_count}</p>
            <p className="text-xs text-zinc-500 mt-0.5">약사</p>
          </div>
        )}
        {herbal_pharmacist_count > 0 && (
          <div className="text-center">
            <p className="text-2xl font-bold text-rose-600 font-mono">{herbal_pharmacist_count}</p>
            <p className="text-xs text-zinc-500 mt-0.5">한약사</p>
          </div>
        )}
      </div>
      <p className="text-[10px] text-zinc-400 mt-3">
        HIRA 분기 인력 데이터 기준
      </p>
    </div>
  );
}
