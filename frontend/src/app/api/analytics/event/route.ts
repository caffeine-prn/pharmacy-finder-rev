import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

const VALID_EVENTS = new Set([
  "page_view",
  "filter_toggle",
  "region_filter",
  "date_filter",
  "pharmacy_click",
  "field_report_open",
  "field_report_submit",
  "hira_staff_lookup_click",
  "csv_export",
  "view_change",
]);

function sanitizeText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > 4000) return { truncated: true };
  return value as Record<string, unknown>;
}

function deviceType(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobile|iphone|android/.test(ua)) return "mobile";
  if (ua) return "desktop";
  return "unknown";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const eventName = sanitizeText(body?.event_name, 80);

  if (!eventName || !VALID_EVENTS.has(eventName)) {
    return NextResponse.json({ error: "지원하지 않는 이벤트입니다." }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { error } = await supabase.from("analytics_events").insert({
    event_name: eventName,
    session_id: sanitizeText(body?.session_id, 120),
    pharmacy_id: sanitizeText(body?.pharmacy_id, 80),
    view_name: sanitizeText(body?.view, 40),
    path: sanitizeText(body?.path, 500),
    referrer: sanitizeText(body?.referrer, 500),
    device_type: deviceType(request.headers.get("user-agent") || ""),
    country: sanitizeText(request.headers.get("x-vercel-ip-country"), 8),
    metadata: sanitizeMetadata(body?.metadata),
  });

  if (error) {
    console.error("Failed to insert analytics event:", error);
    return NextResponse.json({ error: "이벤트 기록에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
