import type { Metadata } from "next";
import { NearbyHerbalExperience } from "@/components/nearby/NearbyHerbalExperience";

export const metadata: Metadata = {
  title: "내 주변 한약사 약국 보기 | 전국 약국 찾기",
  description: "현재 위치를 기준으로 반경 안의 한약사·한약국 정보를 지도와 목록으로 확인합니다.",
  alternates: {
    canonical: "/nearby-herbal",
  },
};

export default function NearbyHerbalPage() {
  return <NearbyHerbalExperience />;
}
