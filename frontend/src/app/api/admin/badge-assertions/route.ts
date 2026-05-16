import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin, writeAdminAudit } from "@/lib/adminAuth";
import {
  isCommunityBadgeType,
  publicBadgeLabel,
  sanitizeText,
} from "@/lib/badges";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "reviewer");
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const pharmacyId = sanitizeText(body?.pharmacy_id, 80);
  const badgeType = body?.badge_type;
  if (!pharmacyId || !isCommunityBadgeType(badgeType)) {
    return NextResponse.json({ error: "약국과 배지 유형을 확인해 주세요." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const supabase = createServiceSupabase();
  const payload = {
    pharmacy_id: pharmacyId,
    badge_type: badgeType,
    assertion_status: body?.assertion_status === "hidden" ? "hidden" : "published",
    confidence: sanitizeText(body?.confidence, 40) || "admin_reviewed",
    label: sanitizeText(body?.label, 80) || publicBadgeLabel(badgeType),
    public_note:
      sanitizeText(body?.public_note, 500) ||
      "공식 HIRA 인력정보와 별개로, 현장 제보가 관리자 검토를 거쳐 표시된 항목입니다.",
    evidence_summary: sanitizeText(body?.evidence_summary, 1000) || null,
    report_count: Number.isFinite(Number(body?.report_count)) ? Number(body.report_count) : 1,
    confirmed_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("pharmacy_badge_assertions")
    .upsert(payload, { onConflict: "pharmacy_id,badge_type" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await writeAdminAudit(
    auth.context,
    "badge_assertion_publish",
    "pharmacy_badge_assertion",
    data?.id || `${pharmacyId}:${badgeType}`,
    {
      pharmacy_id: pharmacyId,
      badge_type: badgeType,
      assertion_status: payload.assertion_status,
    }
  );
  return NextResponse.json({ assertion: data });
}
