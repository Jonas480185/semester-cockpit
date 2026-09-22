import Cockpit from "./components/cockpit";
import { redirect } from "next/navigation";
import { isDemoDeployment } from "@/lib/runtime-mode";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (isDemoDeployment()) redirect("/demo");
  const { requireUser } = await import("@/lib/auth");
  await requireUser("/");
  return <Cockpit />;
}
