import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { supabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isSameOrigin, ownerSessionUser } from "@/lib/auth";

export async function POST(request: Request) {
  if (isDemoDeployment()) return demoBackendResponse();
  if (!isSameOrigin(request)) return new Response(null,{status:403});
  const supabase = await supabaseServer();
  if (!await ownerSessionUser(supabase)) return new Response(null,{status:401});
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", process.env.APP_URL || request.url),303);
}
