import Link from "next/link";
import Image from "next/image";
import FinishEmailLogin from "./finish";

export const metadata = {referrer: "no-referrer" as const};
export default function EmailCallback() {
  return <main className="auth-page"><section className="auth-card">
    <Link href="/" className="auth-brand"><Image src="/semester-mark.png" alt="" width={52} height={52}/><span>semester</span></Link>
    <FinishEmailLogin />
  </section></main>;
}
