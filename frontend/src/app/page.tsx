"use client";

import { PharmacyMap } from "@/components/map/PharmacyMap";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col h-full">
      <PharmacyMap />
    </div>
  );
}
