import type { Metadata } from "next";
import { AdminAnalyticsDashboard } from "@/components/admin/AdminAnalyticsDashboard";

export const metadata: Metadata = {
  title: "서비스 이용 분석",
};

export default function AdminAnalyticsPage() {
  return <AdminAnalyticsDashboard />;
}
