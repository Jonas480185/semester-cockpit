import { isDemoDeployment, demoBackendResponse } from "./lib/runtime-mode";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  if (isDemoDeployment()) {
    if (request.nextUrl.pathname === "/") return NextResponse.redirect(new URL("/demo" + request.nextUrl.search, request.url));
    if (request.nextUrl.pathname === "/demo") return NextResponse.next();
    return demoBackendResponse();
  }
  // Even on a private instance, the isolated demo never refreshes an owner session.
  if (request.nextUrl.pathname === "/demo") return NextResponse.next();
  let response = NextResponse.next({ request });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || request.headers.has("authorization")) return response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    } },
  );
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/", "/demo", "/.well-known/:path*", "/login", "/connections", "/oauth/:path*", "/auth/:path*", "/api/:path*"] };
