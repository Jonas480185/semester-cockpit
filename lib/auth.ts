import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase/server";

export function allowedUser(user: { email?: string; email_confirmed_at?: string }) {
  const ownerEmail = process.env.COCKPIT_OWNER_EMAIL?.trim().toLowerCase();
  return !!ownerEmail && !!user.email_confirmed_at && user.email?.toLowerCase() === ownerEmail;
}

// Browser authority belongs only to a verified first-party owner session.
// A delegated OAuth token remains delegated even when supplied in an SSR cookie.
export async function ownerSessionUser(supabase: SupabaseClient, accessToken?: string) {
  try {
    // Session storage is only a source for the effective token, including refresh.
    // Never trust the user or decoded claims supplied inside a cookie.
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return null;
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims || "client_id" in data.claims) return null;
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user || data.claims.sub !== user.id || !allowedUser(user)) return null;
    return user;
  } catch {
    return null;
  }
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u0020\u007f]/.test(value)) return "/";
  return value;
}

export function isSameOrigin(request: Request) {
  // Hosting proxies can use an internal origin in request.url.
  const expected = new URL(process.env.APP_URL || request.url).origin;
  return request.headers.get("origin") === expected && request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function requireUser(returnTo = "/", supabase?: SupabaseClient) {
  const user = await ownerSessionUser(supabase ?? await supabaseServer());
  if (!user) redirect(`/login?next=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return user;
}
