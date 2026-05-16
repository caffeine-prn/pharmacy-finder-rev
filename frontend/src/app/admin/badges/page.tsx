import type { Metadata } from "next";
import { AdminBadgeReview } from "@/components/admin/AdminBadgeReview";

export const metadata: Metadata = {
  title: "커뮤니티 배지 관리자",
};

export default function AdminBadgesPage() {
  return <AdminBadgeReview />;
}

