import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { supabaseServer } from "@/lib/supabase/server";
import { ownerSessionUser, safeReturnTo } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (isDemoDeployment()) return demoBackendResponse();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = process.env.APP_URL || url.origin;
  if (code) {
    const supabase = await supabaseServer();
    const {data, error} = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session && await ownerSessionUser(supabase, data.session.access_token)) {
      return NextResponse.redirect(new URL(safeReturnTo(url.searchParams.get("next")), origin));
    }
    if (data.session) await supabase.auth.signOut({scope: "local"});
  }
  return NextResponse.redirect(new URL("/login?error=expired", origin));
}
