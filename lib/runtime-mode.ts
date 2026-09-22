/** Server-only deployment boundary. Public portfolio mode is fail-closed by default. */
export function isDemoDeployment() {
  const mode = process.env.COCKPIT_MODE;
  if (mode && mode !== "demo" && mode !== "private") throw new Error("COCKPIT_MODE must be demo or private.");
  return mode !== "private";
}
export function assertPrivateBackend() {
  if (isDemoDeployment()) throw new Error("Backend disabled in the public demo.");
}
export function assertDemoEnvironment() {
  if (!isDemoDeployment()) return;
  const forbidden = Object.keys(process.env).filter(key => /(?:DATABASE_URL|SUPABASE|COCKPIT_OWNER_EMAIL|COCKPIT_KEY|COCKPIT_URL)/i.test(key) && process.env[key]);
  if (forbidden.length) throw new Error("Demo must start without database, Supabase or owner credentials. Remove these variables from this separate demo environment: " + forbidden.join(", "));
}
export function demoBackendResponse() {
  return Response.json({ error: "Diese öffentliche Demo hat keinen Datenbank-, Auth- oder Agentenzugriff." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
