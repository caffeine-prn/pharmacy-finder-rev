import type { Metadata } from "next";
import { AdminUsersPanel } from "@/components/admin/AdminUsersPanel";

export const metadata: Metadata = {
  title: "관리자 계정",
};

export default function AdminUsersPage() {
  return <AdminUsersPanel />;
}
