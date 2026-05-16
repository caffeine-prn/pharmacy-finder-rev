import { NextRequest, NextResponse } from "next/server";
import { createAuthServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const supabase = createAuthServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/admin/login", origin));
}
