import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/badges";

const STATUSES = new Set([
  "pending",
  "reviewing",
  "approved",
  "rejected",
  "needs_more_evidence",
]);

function isAdmin(request: NextRequest) {
  const configured = process.env.ADMIN_BADGE_TOKEN;
  const provided = request.headers.get("x-admin-token") || request.nextUrl.searchParams.get("token");
  return Boolean(configured && provided && configured === provided);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "관리자 토큰이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const status = String(body?.report_status || "");
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: "지원하지 않는 검토 상태입니다." }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("pharmacy_badge_reports")
    .update({
      report_status: status,
      admin_note: sanitizeText(body?.admin_note, 1000) || null,
      reviewed_by: sanitizeText(body?.reviewed_by, 100) || "admin",
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ report: data });
}

