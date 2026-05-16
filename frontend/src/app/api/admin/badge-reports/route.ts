import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

function isAdmin(request: NextRequest) {
  const configured = process.env.ADMIN_BADGE_TOKEN;
  const provided = request.headers.get("x-admin-token") || request.nextUrl.searchParams.get("token");
  return Boolean(configured && provided && configured === provided);
}

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "관리자 토큰이 필요합니다." }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status") || "pending";
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("pharmacy_badge_reports")
    .select(`
      *,
      pharmacies (
        id,
        name,
        sido,
        sigungu,
        road_address,
        address,
        has_ykiho,
        pharmacist_count,
        herbal_pharmacist_count,
        hira_staff_fetched_at
      )
    `)
    .eq("report_status", status)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reports: data || [] });
}

