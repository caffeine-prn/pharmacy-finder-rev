import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminAuth";

function increment(map: Map<string, number>, key: string | null | undefined) {
  const normalized = key || "unknown";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function topEntries(map: Map<string, number>, limit = 10) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "viewer");
  if ("response" in auth) return auth.response;

  const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get("days") || 7)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("analytics_events")
    .select("event_name,session_id,pharmacy_id,view_name,path,device_type,country,metadata,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const events = data || [];
  const sessions = new Set<string>();
  const byEvent = new Map<string, number>();
  const byPath = new Map<string, number>();
  const byDevice = new Map<string, number>();
  const byView = new Map<string, number>();
  const byCountry = new Map<string, number>();
  const byPharmacy = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const event of events) {
    if (event.session_id) sessions.add(event.session_id);
    increment(byEvent, event.event_name);
    increment(byPath, event.path);
    increment(byDevice, event.device_type);
    increment(byView, event.view_name);
    increment(byCountry, event.country);
    increment(byDay, String(event.created_at).slice(0, 10));
    if (event.pharmacy_id) increment(byPharmacy, event.pharmacy_id);
  }

  const topPharmacyIds = topEntries(byPharmacy, 10).map((entry) => entry.key);
  const { data: pharmacies } = topPharmacyIds.length
    ? await supabase
        .from("pharmacies")
        .select("id,name,sido,sigungu")
        .in("id", topPharmacyIds)
    : { data: [] };
  const pharmacyById = new Map((pharmacies || []).map((pharmacy) => [pharmacy.id, pharmacy]));

  return NextResponse.json({
    days,
    totalEvents: events.length,
    uniqueSessions: sessions.size,
    byEvent: topEntries(byEvent, 20),
    byPath: topEntries(byPath, 12),
    byDevice: topEntries(byDevice, 8),
    byView: topEntries(byView, 8),
    byCountry: topEntries(byCountry, 8),
    byDay: Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count })),
    topPharmacies: topEntries(byPharmacy, 10).map((entry) => ({
      ...entry,
      pharmacy: pharmacyById.get(entry.key) || null,
    })),
    recent: events.slice(0, 50),
  });
}
