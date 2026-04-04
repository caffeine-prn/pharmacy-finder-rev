// frontend/src/components/pharmacy/NearbyPharmacies.tsx
"use client";

import Link from "next/link";
import { MapPin } from "@phosphor-icons/react";
import type { NearbyPharmacy } from "@/lib/types";

interface NearbyPharmaciesProps {
  pharmacies: NearbyPharmacy[];
}

export function NearbyPharmacies({ pharmacies }: NearbyPharmaciesProps) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={18} className="text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-900">주변 약국</h3>
      </div>
      <div className="space-y-2">
        {pharmacies.map((p) => (
          <Link
            key={p.id}
            href={`/pharmacy/${p.id}`}
            className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-zinc-50 transition-colors"
          >
            <span className="text-sm text-zinc-800">{p.name}</span>
            {p.distance_m > 0 ? (
              <span className="text-xs text-zinc-400 font-mono flex-shrink-0 ml-2">
                {p.distance_m < 1000
                  ? `${Math.round(p.distance_m)}m`
                  : `${(p.distance_m / 1000).toFixed(1)}km`}
              </span>
            ) : (
              <span className="text-xs text-zinc-300 flex-shrink-0 ml-2">같은 시군구</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
