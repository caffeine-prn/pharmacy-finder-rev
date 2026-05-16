// frontend/src/components/panels/PharmacySlidePanel.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Phone,
  MapPin,
  Calendar,
  Flag,
  NavigationArrow,
} from "@phosphor-icons/react";
import { usePharmacyStore } from "@/lib/store";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { supabase } from "@/lib/supabase/client";
import type { Pharmacy, PharmacyBadgeAssertion } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { PharmacyStatusButtons } from "@/components/pharmacy/PharmacyStatusButtons";
import { LifecycleTimeline } from "@/components/pharmacy/LifecycleTimeline";
import { HiraStaffLookup } from "@/components/pharmacy/HiraStaffLookup";
import { OperatingHours } from "@/components/pharmacy/OperatingHours";
import { CommunityBadgePanel } from "@/components/pharmacy/CommunityBadgePanel";
import { CommunityReportForm } from "@/components/pharmacy/CommunityReportForm";

export function PharmacySlidePanel() {
  const { selectedPharmacyId, selectedPharmacySeq, setSelectedPharmacyId } = usePharmacyStore();
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [badgeAssertions, setBadgeAssertions] = useState<PharmacyBadgeAssertion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const reportFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!selectedPharmacyId) {
      setPharmacy(null);
      setBadgeAssertions([]);
      return;
    }

    let ignore = false;
    setLoading(true);
    Promise.all([
      supabase
        .from("pharmacies")
        .select("*")
        .eq("id", selectedPharmacyId)
        .single(),
      supabase
        .from("pharmacy_badge_assertions")
        .select("*")
        .eq("pharmacy_id", selectedPharmacyId)
        .eq("assertion_status", "published")
        .order("confirmed_at", { ascending: false }),
    ]).then(([pharmacyResult, assertionsResult]) => {
      if (ignore) return;
      if (pharmacyResult.error) {
        console.error("Failed to fetch pharmacy:", pharmacyResult.error);
        setPharmacy(null);
        setBadgeAssertions([]);
      } else {
        setPharmacy(pharmacyResult.data as Pharmacy);
        setBadgeAssertions((assertionsResult.data || []) as PharmacyBadgeAssertion[]);
      }
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [selectedPharmacyId, selectedPharmacySeq]);

  const handleClose = () => setSelectedPharmacyId(null);

  const naverSearchUrl = pharmacy
    ? `https://map.naver.com/v5/search/${encodeURIComponent(pharmacy.name + " " + (pharmacy.address || ""))}`
    : "";
  const kakaoSearchUrl = pharmacy
    ? `https://map.kakao.com/?q=${encodeURIComponent(pharmacy.name + " " + (pharmacy.address || ""))}`
    : "";

  return (
    <AnimatePresence>
      {selectedPharmacyId && (
        <motion.div
          key={selectedPharmacyId}
          initial={isMobile ? { y: "100%" } : { x: "100%" }}
          animate={isMobile ? { y: 0 } : { x: 0 }}
          exit={isMobile ? { y: "100%" } : { x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute right-0 top-0 bottom-0 w-[360px] max-w-[90vw] z-[1001] bg-white border-l border-zinc-200 shadow-2xl flex flex-col max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:max-h-[70vh] max-sm:rounded-t-2xl max-sm:border-l-0 max-sm:border-t"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-100 bg-white/95 p-4 backdrop-blur-sm">
            <div className="flex-1 min-w-0">
              {loading ? (
                <Skeleton className="h-6 w-40" />
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-lg font-bold text-zinc-900">
                    {pharmacy?.name}
                  </h2>
                  {pharmacy && (
                    <button
                      type="button"
                      onClick={() => {
                        trackAnalyticsEvent({
                          eventName: "field_report_open",
                          pharmacyId: pharmacy.id,
                          view: "panel",
                          metadata: { name: pharmacy.name },
                        });
                        reportFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <Flag size={13} />
                      현장정보제보
                    </button>
                  )}
                </div>
              )}
              {!loading && pharmacy && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {pharmacy.is_herbal_pharmacy && <Badge variant="herbal">한약사</Badge>}
                  {pharmacy.is_animal_pharmacy && <Badge variant="animal">동물약국</Badge>}
                  {pharmacy.is_cross_employed && <Badge variant="cross">교차고용</Badge>}
                  {!pharmacy.has_ykiho && <Badge variant="noYkiho">요양X</Badge>}
                  {badgeAssertions.map((assertion) => (
                    <Badge key={assertion.id} variant="herbal">
                      {assertion.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : pharmacy ? (
              <>
                <CommunityBadgePanel assertions={badgeAssertions} />
                <PharmacyStatusButtons pharmacy={pharmacy} compact />
                <LifecycleTimeline pharmacy={pharmacy} compact />

                {/* Address */}
                {pharmacy.address && (
                  <div className="flex items-start gap-2.5">
                    <MapPin size={16} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-zinc-700">{pharmacy.road_address || pharmacy.address}</p>
                      {pharmacy.road_address && pharmacy.address !== pharmacy.road_address && (
                        <p className="text-xs text-zinc-400 mt-0.5">{pharmacy.address}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Phone */}
                {pharmacy.phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone size={16} className="text-zinc-400 flex-shrink-0" />
                    <a
                      href={`tel:${pharmacy.phone}`}
                      className="text-sm text-emerald-600 hover:underline"
                    >
                      {pharmacy.phone}
                    </a>
                  </div>
                )}

                {pharmacy.open_date && (
                  <div className="flex items-center gap-2.5">
                    <Calendar size={16} className="text-zinc-400 flex-shrink-0" />
                    <p className="text-sm text-zinc-600">개설일: {pharmacy.open_date}</p>
                  </div>
                )}

                <OperatingHours pharmacy={pharmacy} />

                <HiraStaffLookup pharmacy={pharmacy} />

                {/* External links */}
                <div className="flex gap-2">
                  <a
                    href={naverSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <NavigationArrow size={14} />
                    네이버에서 보기
                  </a>
                  <a
                    href={kakaoSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <NavigationArrow size={14} />
                    카카오에서 보기
                  </a>
                </div>

                <div ref={reportFormRef} className="scroll-mt-4">
                  <CommunityReportForm pharmacy={pharmacy} />
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">약국 정보를 불러올 수 없습니다.</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
