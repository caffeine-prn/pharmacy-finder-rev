import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/adminAuth";
import { createServiceSupabase } from "@/lib/supabase/server";

const ROLES = new Set(["owner", "reviewer", "viewer"]);
const STATUSES = new Set(["active", "disabled"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request, "owner");
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const patch: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (ROLES.has(body?.role)) patch.role = body.role;
  if (STATUSES.has(body?.status)) patch.status = body.status;

  const displayName = String(body?.display_name || "").trim().slice(0, 80);
  if ("display_name" in (body || {})) patch.display_name = displayName;

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("admin_users")
    .update(patch)
    .eq("id", params.id)
    .select("id,user_id,email,role,status,display_name,last_seen_at,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAdminAudit(auth.context, "admin_user_update", "admin_user", params.id, patch);

  return NextResponse.json({ user: data });
}
