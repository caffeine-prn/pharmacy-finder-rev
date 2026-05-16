import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/adminAuth";
import { createServiceSupabase } from "@/lib/supabase/server";

const ROLES = new Set(["owner", "reviewer", "viewer"]);
const STATUSES = new Set(["active", "disabled"]);

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "owner");
  if ("response" in auth) return auth.response;

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,user_id,email,role,status,display_name,last_seen_at,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "owner");
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const role = ROLES.has(body?.role) ? body.role : "reviewer";
  const status = STATUSES.has(body?.status) ? body.status : "active";
  const displayName = String(body?.display_name || "").trim().slice(0, 80) || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "관리자 이메일을 확인해 주세요." }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("admin_users")
    .upsert(
      {
        email,
        role,
        status,
        display_name: displayName,
        invited_by: auth.context.email,
        updated_at: now,
      },
      { onConflict: "email" }
    )
    .select("id,user_id,email,role,status,display_name,last_seen_at,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAdminAudit(auth.context, "admin_user_upsert", "admin_user", data.id, {
    email,
    role,
    status,
  });

  return NextResponse.json({ user: data });
}
