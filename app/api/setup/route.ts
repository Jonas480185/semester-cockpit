import { isDemoDeployment, demoBackendResponse } from "@/lib/runtime-mode";
import { authorize, initialize, json, failure } from "@/lib/server";
export async function POST(r: Request) {
  if (isDemoDeployment()) return demoBackendResponse();
  try {
    const a = await authorize(r, true);
    if (!a.browser)
      return json({ error: "Einrichtung nur durch den Nutzer." }, 403);
    await initialize(a.owner);
    return json({ ready: true });
  } catch (e) {
    return failure(e);
  }
}
