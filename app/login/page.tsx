import Link from "next/link";
import Image from "next/image";
import LoginForm from "./form";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ownerSessionUser, safeReturnTo } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function Login({searchParams}:{searchParams:Promise<{error?:string; next?:string}>}) {
  const {error, next} = await searchParams;
  const supabase = await supabaseServer();
  const user = await ownerSessionUser(supabase);
  if (user) redirect(safeReturnTo(next));
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="auth-brand"><Image src="/semester-mark.png" alt="" width={52} height={52} /><span>semester</span></Link>
    <div><p className="eyebrow">DEIN LERNCOCKPIT</p><h1>Dein Semester.<br />Dein nächster Schritt.</h1><p>Lernpläne, Wissenslücken und echte Fortschritte an einem Ort.</p></div>
    <LoginForm expired={error === "expired"} />
    <p className="auth-note">Einmal anmelden. Auf diesem Gerät bleibst du angemeldet.</p>
  </section></main>;
}
