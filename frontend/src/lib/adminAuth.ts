import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServiceSupabase } from "@/lib/supabase/server";

export type AdminRole = "owner" | "reviewer" | "viewer";

export interface AdminUser {
  id: string;
  user_id: string | null;
  email: string;
  role: AdminRole;
  status: "active" | "disabled";
}

export interface AdminContext {
  method: "auth" | "token";
  admin: AdminUser | null;
  user: User | null;
  email: string;
}

const ROLE_RANK: Record<AdminRole, number> = {
  viewer: 1,
  reviewer: 2,
  owner: 3,
};

function tokenFromRequest(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

function legacyTokenMatches(request: NextRequest) {
  const configured = process.env.ADMIN_BADGE_TOKEN;
  const provided = request.headers.get("x-admin-token") || request.nextUrl.searchParams.get("token");
  return Boolean(configured && provided && configured === provided);
}

export function hasAdminRole(context: AdminContext, minimum: AdminRole) {
  if (context.method === "token") return true;
  if (!context.admin) return false;
  return ROLE_RANK[context.admin.role] >= ROLE_RANK[minimum];
}

export async function requireAdmin(
  request: NextRequest,
  minimumRole: AdminRole = "viewer"
): Promise<{ context: AdminContext } | { response: NextResponse }> {
  const supabase = createServiceSupabase();
  const accessToken = tokenFromRequest(request);

  if (accessToken) {
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    const user = userData?.user || null;
    const email = user?.email?.toLowerCase() || "";

    if (!userError && user && email) {
      const { data: admin, error: adminError } = await supabase
        .from("admin_users")
        .select("id,user_id,email,role,status")
        .eq("email", email)
        .eq("status", "active")
        .maybeSingle();

      if (!adminError && admin && hasAdminRole({ method: "auth", admin: admin as AdminUser, user, email }, minimumRole)) {
        if (!admin.user_id || admin.user_id !== user.id) {
          await supabase
            .from("admin_users")
            .update({ user_id: user.id, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", admin.id);
        } else {
          await supabase
            .from("admin_users")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", admin.id);
        }

        return {
          context: {
            method: "auth",
            admin: { ...(admin as AdminUser), user_id: user.id },
            user,
            email,
          },
        };
      }
    }
  }

  if (legacyTokenMatches(request)) {
    return {
      context: {
        method: "token",
        admin: null,
        user: null,
        email: "legacy-token-admin",
      },
    };
  }

  return {
    response: NextResponse.json(
      { error: "관리자 로그인이 필요합니다." },
      { status: 401 }
    ),
  };
}

export async function writeAdminAudit(
  context: AdminContext,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {}
) {
  const supabase = createServiceSupabase();
  await supabase.from("admin_audit_log").insert({
    admin_user_id: context.admin?.id || null,
    admin_email: context.email,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
}
