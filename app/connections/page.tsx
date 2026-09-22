import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/server";

export const dynamic="force-dynamic";
export default async function Connections() {
  const user=await requireUser("/connections");
  const {results}=await db().prepare("SELECT client_id,scope FROM oauth_grants WHERE ownerId=? AND revoked=0").bind(user.id).all();
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="auth-brand"><Image src="/semester-mark.png" alt="" width={44} height={44}/><span>semester</span></Link>
    <div><h1>Verbundene Agenten</h1><p>Hier kannst du den Zugriff einer Verbindung jederzeit beenden.</p></div>
    {results.length===0 && <p>Noch keine Agenten verbunden.</p>}
    {results.map(grant=><form key={grant.client_id} className="auth-form" action="/api/oauth/revoke" method="POST"><div className="auth-permissions"><strong>{grant.scope==="read-write" ? "Lesen und schreiben" : "Nur lesen"}</strong><p className="auth-note">Verbindung {grant.client_id}</p></div><input type="hidden" name="client_id" value={grant.client_id}/><button className="secondary">Zugriff widerrufen</button></form>)}
    <Link href="/?view=Agent%20%26%20API">Zurück zum Cockpit</Link>
  </section></main>;
}
