import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { sanitizeText } from "@/lib/badges";
import { requireAdmin, writeAdminAudit } from "@/lib/adminAuth";

const STATUSES = new Set([
  "pending",
  "reviewing",
  "approved",
  "rejected",
  "needs_more_evidence",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request, "reviewer");
  if ("response" in auth) return auth.response;

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
      reviewed_by: auth.context.email,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await writeAdminAudit(auth.context, "badge_report_status_update", "pharmacy_badge_report", params.id, {
    status,
  });
  return NextResponse.json({ report: data });
}
