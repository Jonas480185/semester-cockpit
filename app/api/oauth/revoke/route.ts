import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { supabaseServer } from "@/lib/supabase/server";
import { ownerSessionUser, isSameOrigin } from "@/lib/auth";
import { db, failure, ApiError } from "@/lib/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (isDemoDeployment()) return demoBackendResponse();
  try {
    if(!isSameOrigin(request)) throw new ApiError(403,"Fremde Herkunft nicht erlaubt.");
    const supabase=await supabaseServer();
    const user=await ownerSessionUser(supabase);
    if(!user) throw new ApiError(401,"Bitte anmelden.");
    const clientId=String((await request.formData()).get("client_id") || "");
    await db().batch([
      db().prepare("UPDATE oauth_grants SET revoked=1 WHERE ownerId=? AND client_id=?").bind(user.id,clientId),
      db().prepare("INSERT INTO audit (id,ownerId,date,actor,entity,entityId,action,before,after,revision) VALUES (?,?,?,'Nutzer','oauth_grants',?,'revoke',NULL,NULL,0)").bind(crypto.randomUUID(),user.id,new Date().toISOString(),clientId),
    ]);
    // The local grant denies access immediately, even before upstream revocation completes.
    await supabase.auth.oauth.revokeGrant({clientId});
    return NextResponse.redirect(new URL("/connections",process.env.APP_URL || request.url),303);
  } catch(error) {return failure(error);}
}
