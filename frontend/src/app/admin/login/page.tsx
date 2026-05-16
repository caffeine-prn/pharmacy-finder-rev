import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

export const metadata: Metadata = {
  title: "관리자 로그인",
};

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-zinc-50" />}>
      <AdminLoginForm />
    </Suspense>
  );
}
