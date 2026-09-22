import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { createClient } from "@supabase/supabase-js";
import { safeReturnTo, isSameOrigin } from "@/lib/auth";
import { json, readBody, failure, ApiError } from "@/lib/server";
import { z } from "zod";

export async function POST(request: Request) {
  if (isDemoDeployment()) return demoBackendResponse();
  try {
    if (!isSameOrigin(request)) throw new ApiError(403, "Fremde Herkunft nicht erlaubt.");
    const {email, next} = z.object({email: z.string().trim().toLowerCase().email().max(254), next: z.string().max(2000).optional()}).parse(await readBody(request));
    if (!process.env.COCKPIT_OWNER_EMAIL) throw new ApiError(503, "Die Anmeldung wird noch eingerichtet.");
    if (email.toLowerCase() !== process.env.COCKPIT_OWNER_EMAIL.toLowerCase()) throw new ApiError(403, "Diese E-Mail-Adresse ist nicht für das Cockpit freigegeben.");
    // Email links must also work when the mail app opens a different browser.
    // OAuth clients continue to use their separate PKCE authorization flow.
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: {flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    });
    const origin = process.env.APP_URL || new URL(request.url).origin;
    const {error} = await supabase.auth.signInWithOtp({email, options:{emailRedirectTo: `${origin}/auth/callback/email?next=${encodeURIComponent(safeReturnTo(next))}`}});
    if (error) throw new ApiError(error.status === 429 ? 429 : 503, error.status === 429 ? "Bitte warte kurz, bevor du eine weitere E-Mail anforderst." : "Die E-Mail konnte gerade nicht gesendet werden. Bitte versuche es später erneut.");
    return json({sent:true});
  } catch(error) { return failure(error); }
}
