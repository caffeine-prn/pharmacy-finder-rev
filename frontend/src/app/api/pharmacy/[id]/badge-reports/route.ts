import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isCommunityBadgeType, isEvidenceType, sanitizeText } from "@/lib/badges";

function hashIp(value: string | null) {
  if (!value) return null;
  const salt = process.env.REPORT_IP_HASH_SALT || process.env.SUPABASE_SERVICE_KEY || "";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceSupabase();
  const body = await request.json().catch(() => null);

  const badgeType = body?.badge_type;
  const evidenceType = body?.evidence_type || "other";
  const description = sanitizeText(body?.description, 2000);
  const reporterContact = sanitizeText(body?.reporter_contact, 200);

  if (!isCommunityBadgeType(badgeType)) {
    return NextResponse.json({ error: "지원하지 않는 제보 유형입니다." }, { status: 400 });
  }
  if (!isEvidenceType(evidenceType)) {
    return NextResponse.json({ error: "지원하지 않는 근거 유형입니다." }, { status: 400 });
  }
  if (description.length < 5) {
    return NextResponse.json({ error: "제보 내용은 5자 이상 입력해 주세요." }, { status: 400 });
  }

  const { data: pharmacy, error: pharmacyError } = await supabase
    .from("pharmacies")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();

  if (pharmacyError || !pharmacy) {
    return NextResponse.json({ error: "약국을 찾을 수 없습니다." }, { status: 404 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const { data, error } = await supabase
    .from("pharmacy_badge_reports")
    .insert({
      pharmacy_id: params.id,
      badge_type: badgeType,
      evidence_type: evidenceType,
      description,
      reporter_contact: reporterContact || null,
      reporter_ip_hash: hashIp(forwardedFor),
      user_agent: sanitizeText(request.headers.get("user-agent"), 500) || null,
    })
    .select("id,report_status,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, report: data }, { status: 201 });
}

