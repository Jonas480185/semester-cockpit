import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function Consent({searchParams}:{searchParams:Promise<{authorization_id?:string}>}) {
  const id=(await searchParams).authorization_id;
  if (!id) return <main className="auth-page"><section className="auth-card">Dieser Verbindungslink ist ungültig.</section></main>;
  const supabase=await supabaseServer();
  await requireUser(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`, supabase);
  const {data, error}=await supabase.auth.oauth.getAuthorizationDetails(id);
  if(error || !data) return <main className="auth-page"><section className="auth-card">Die Verbindungsanfrage ist abgelaufen. Starte sie bitte erneut in ChatGPT.</section></main>;
  if(!("authorization_id" in data)) redirect(data.redirect_url);
  return <main className="auth-page"><section className="auth-card">
    <Link className="auth-brand" href="/"><Image src="/semester-mark.png" alt="" width={44} height={44}/><span>semester</span></Link>
    <div><p className="eyebrow">AGENT VERBINDEN</p><h1>{data.client.name || "Dein Agent"} mit dem Cockpit verbinden</h1><p>Du legst fest, wie diese Verbindung auf deine Lerndaten zugreifen darf.</p></div>
    <form action="/api/oauth/decision" method="POST" className="auth-form">
      <input type="hidden" name="authorization_id" value={id}/>
      <div className="auth-permissions"><label htmlFor="scope">Zugriff auf dein Semester</label><select id="scope" name="scope" defaultValue="read"><option value="read">Nur lesen und analysieren</option><option value="read-write">Lesen, planen und Änderungen speichern</option></select><p>Module, Themen, Aufgaben, Tests, Wissenslücken, Lernzeit und Pläne. Änderungen werden protokolliert.</p></div>
      <p className="auth-note">Angefragte Kontoinformationen: {data.scope || "keine"}<br/>Rückleitung: {new URL(data.redirect_uri).hostname}</p>
      <div className="auth-actions"><button className="primary" name="decision" value="approve">Verbindung erlauben</button><button className="secondary" name="decision" value="deny">Ablehnen</button></div>
    </form>
  </section></main>;
}
