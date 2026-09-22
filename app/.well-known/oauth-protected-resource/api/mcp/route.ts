import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { json } from "@/lib/server";
export async function GET(request: Request) {
  if (isDemoDeployment()) return demoBackendResponse();
  const origin = process.env.APP_URL || new URL(request.url).origin;
  return json({resource: `${origin}/api/mcp`, authorization_servers:[`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`], scopes_supported:["openid", "email"], bearer_methods_supported:["header"], resource_name:"Semester-Cockpit"});
}
