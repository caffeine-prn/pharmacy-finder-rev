// frontend/src/app/pharmacy/[id]/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { PharmacyDetail } from "@/components/pharmacy/PharmacyDetail";
import type { Pharmacy, NearbyPharmacy } from "@/lib/types";

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("pharmacies")
    .select("name, address, sido, sigungu")
    .eq("id", params.id)
    .single();

  if (!data) return { title: "약국을 찾을 수 없습니다" };

  return {
    title: `${data.name} - 전국 약국 찾기`,
    description: `${data.name} | ${data.address || ""} | ${data.sido} ${data.sigungu}`,
    openGraph: {
      title: `${data.name} - 전국 약국 찾기`,
      description: `${data.name} 약국 상세 정보 — 주소, 전화번호, 영업시간, 인력정보`,
    },
  };
}

export default async function PharmacyDetailPage({ params }: PageProps) {
  const supabase = createServerSupabase();

  // Fetch pharmacy detail
  const { data: pharmacy, error } = await supabase
    .from("pharmacies")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !pharmacy) {
    notFound();
  }

  // Fetch nearby pharmacies via PostGIS RPC (set up in Task 15)
  // For now, fall back to same sigungu pharmacies
  let nearby: NearbyPharmacy[] = [];

  if (pharmacy.longitude && pharmacy.latitude) {
    const { data: nearbyData } = await supabase.rpc("get_nearby_pharmacies", {
      lng: pharmacy.longitude,
      lat: pharmacy.latitude,
      radius_m: 1000,
      exclude_id: pharmacy.id,
      max_count: 10,
    });
    if (nearbyData) {
      nearby = nearbyData as NearbyPharmacy[];
    }
  }

  // Fallback: same sigungu pharmacies when RPC not available or no results
  if (nearby.length === 0 && pharmacy.sigungu) {
    const { data: sigunguData } = await supabase
      .from("pharmacies")
      .select("id, name, longitude, latitude")
      .eq("sigungu", pharmacy.sigungu)
      .eq("business_status", "영업중")
      .neq("id", pharmacy.id)
      .limit(5);

    if (sigunguData) {
      nearby = sigunguData.map((p) => ({
        id: p.id,
        name: p.name,
        longitude: p.longitude ?? 0,
        latitude: p.latitude ?? 0,
        distance_m: 0, // no distance available without PostGIS
      })) as NearbyPharmacy[];
    }
  }

  return <PharmacyDetail pharmacy={pharmacy as Pharmacy} nearby={nearby} />;
}
