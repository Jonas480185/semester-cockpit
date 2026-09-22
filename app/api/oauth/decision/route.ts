import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { supabaseServer } from "@/lib/supabase/server";
import { ownerSessionUser, isSameOrigin } from "@/lib/auth";
import { db, failure, ApiError } from "@/lib/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (isDemoDeployment()) return demoBackendResponse();
  try {
    if(!isSameOrigin(request)) throw new ApiError(403,"Fremde Herkunft nicht erlaubt.");
    const form=await request.formData(), id=String(form.get("authorization_id") || ""), scope=form.get("scope");
    if(!id || !["read","read-write"].includes(String(scope))) throw new ApiError(400,"Ungültige Freigabe.");
    const supabase=await supabaseServer();
    const user=await ownerSessionUser(supabase);
    if(!user) throw new ApiError(401,"Bitte anmelden.");
    const {data:details,error}=await supabase.auth.oauth.getAuthorizationDetails(id);
    if(error || !details || !("authorization_id" in details) || details.user.id!==user.id) throw new ApiError(400,"Die Anfrage ist abgelaufen.");
    if(form.get("decision")==="deny") {
      const {data,error}=await supabase.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true});
      if(error || !data) throw new ApiError(400,"Anfrage konnte nicht abgelehnt werden.");
      return NextResponse.redirect(data.redirect_url,303);
    }
    if(form.get("decision")!=="approve") throw new ApiError(400,"Ungültige Entscheidung.");
    const now=new Date().toISOString();
    await db().batch([
      db().prepare("INSERT INTO oauth_grants (ownerId,client_id,scope,revoked,updatedAt) VALUES (?,?,?,0,?) ON CONFLICT (ownerId,client_id) DO UPDATE SET scope=EXCLUDED.scope,revoked=0,updatedAt=EXCLUDED.updatedAt").bind(user.id,details.client.id,scope,now),
      db().prepare("INSERT INTO audit (id,ownerId,date,actor,entity,entityId,action,before,after,revision) VALUES (?,?,?,'Nutzer','oauth_grants',?,'approve',NULL,?,0)").bind(crypto.randomUUID(),user.id,now,details.client.id,JSON.stringify({scope})),
    ]);
    const {data, error:approveError}=await supabase.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true});
    if(approveError || !data) {
      await db().batch([db().prepare("UPDATE oauth_grants SET revoked=1 WHERE ownerId=? AND client_id=?").bind(user.id,details.client.id)]);
      throw new ApiError(400,"Die Verbindung konnte nicht abgeschlossen werden.");
    }
    return NextResponse.redirect(data.redirect_url,303);
  } catch(error) {return failure(error);}
}
