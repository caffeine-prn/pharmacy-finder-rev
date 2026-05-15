// frontend/src/components/pharmacy/PharmacyDetail.tsx
"use client";

import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Calendar,
  NavigationArrow,
  Flag,
} from "@phosphor-icons/react";
import type { Pharmacy, NearbyPharmacy } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { OperatingHours } from "./OperatingHours";
import { StaffInfo } from "./StaffInfo";
import { NearbyPharmacies } from "./NearbyPharmacies";
import { PharmacyStatusButtons } from "./PharmacyStatusButtons";

interface PharmacyDetailProps {
  pharmacy: Pharmacy;
  nearby: NearbyPharmacy[];
}

function MiniMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.003},${lng + 0.005},${lat + 0.003}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <iframe
      src={osmUrl}
      className="w-full h-full border-0"
      loading="lazy"
      title={`${name} 위치`}
    />
  );
}

export function PharmacyDetail({ pharmacy, nearby }: PharmacyDetailProps) {
  const addressQuery = encodeURIComponent(
    pharmacy.name + " " + (pharmacy.road_address || pharmacy.address || "")
  );
  const naverUrl = `https://map.naver.com/v5/search/${addressQuery}`;
  const kakaoUrl = `https://map.kakao.com/?q=${addressQuery}`;
  const reportUrl = `https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform?usp=pp_url&entry.123=${encodeURIComponent(pharmacy.name)}&entry.456=${encodeURIComponent(pharmacy.id)}`;

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-primary,#f9fafb)]">
      {/* Back navigation */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-zinc-100 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-zinc-900 truncate">
            {pharmacy.name}
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="pharmacy">약국</Badge>
          {pharmacy.is_herbal_pharmacy && <Badge variant="herbal">한약사</Badge>}
          {pharmacy.is_animal_pharmacy && <Badge variant="animal">동물약국</Badge>}
          {pharmacy.is_cross_employed && <Badge variant="cross">교차고용</Badge>}
          {!pharmacy.has_ykiho && <Badge variant="noYkiho">요양기관번호 미부여</Badge>}
        </div>

        <PharmacyStatusButtons pharmacy={pharmacy} />

        {/* Basic info card */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          {/* Address */}
          {(pharmacy.road_address || pharmacy.address) && (
            <div className="flex items-start gap-3">
              <MapPin size={18} className="text-zinc-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-zinc-800">
                  {pharmacy.road_address || pharmacy.address}
                </p>
                {pharmacy.road_address && pharmacy.address && pharmacy.road_address !== pharmacy.address && (
                  <p className="text-xs text-zinc-400 mt-0.5">{pharmacy.address}</p>
                )}
              </div>
            </div>
          )}

          {/* Phone */}
          {pharmacy.phone && (
            <div className="flex items-center gap-3">
              <Phone size={18} className="text-zinc-400 flex-shrink-0" />
              <a href={`tel:${pharmacy.phone}`} className="text-sm text-emerald-600 hover:underline">
                {pharmacy.phone}
              </a>
            </div>
          )}

          {/* Open date */}
          {pharmacy.open_date && (
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-zinc-400 flex-shrink-0" />
              <p className="text-sm text-zinc-600">개설일: {pharmacy.open_date}</p>
            </div>
          )}
        </div>

        {/* Operating hours */}
        <OperatingHours pharmacy={pharmacy} />

        {/* Staff info */}
        <StaffInfo pharmacy={pharmacy} />

        {/* Mini map */}
        {pharmacy.latitude && pharmacy.longitude && (
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-zinc-900">위치</h3>
            </div>
            <div className="h-48 bg-zinc-100 relative">
              <MiniMap lat={pharmacy.latitude} lng={pharmacy.longitude} name={pharmacy.name} />
            </div>
          </div>
        )}

        {/* External links */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={naverUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <NavigationArrow size={16} />
            네이버 지도
          </a>
          <a
            href={kakaoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <NavigationArrow size={16} />
            카카오맵
          </a>
        </div>

        {/* Report button */}
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-3 text-sm font-medium text-rose-600 hover:bg-rose-100 transition-colors"
        >
          <Flag size={16} />
          정보 오류 신고하기
        </a>

        {/* Nearby pharmacies */}
        {nearby.length > 0 && <NearbyPharmacies pharmacies={nearby} />}
      </div>
    </div>
  );
}
