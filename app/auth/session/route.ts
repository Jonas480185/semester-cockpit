import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { ownerSessionUser, safeReturnTo, isSameOrigin } from "@/lib/auth";
import { ApiError, failure, json, readBody } from "@/lib/server";

export async function POST(request: Request) {
  if (isDemoDeployment()) return demoBackendResponse();
  try {
    if (!isSameOrigin(request)) {
      throw new ApiError(403, "Fremde Herkunft nicht erlaubt.");
    }
    const {access_token, refresh_token, next} = z.object({
      access_token: z.string().min(20).max(16384),
      refresh_token: z.string().min(10).max(4096),
      next: z.string().max(2000).optional(),
    }).strict().parse(await readBody(request));
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(access_token)) throw new ApiError(401, "Dieser Anmeldelink ist ungültig oder abgelaufen.");
    const supabase = await supabaseServer();
    // Validate token provenance before storage and again after a possible refresh.
    if (!await ownerSessionUser(supabase, access_token)) throw new ApiError(401, "Dieser Anmeldelink ist ungültig oder abgelaufen.");
    const {data, error: sessionError} = await supabase.auth.setSession({access_token, refresh_token});
    if (sessionError || !data.session || !await ownerSessionUser(supabase, data.session.access_token)) {
      await supabase.auth.signOut({scope: "local"});
      throw new ApiError(401, "Bitte fordere einen neuen Anmeldelink an.");
    }
    return json({next: safeReturnTo(next)});
  } catch (error) {
    return failure(error);
  }
}
