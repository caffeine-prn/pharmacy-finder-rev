import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "viewer");
  if ("response" in auth) return auth.response;

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
