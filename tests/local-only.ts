/** Fail closed before fixtures initialize. Never reuse any caller-supplied service credentials. */
const forbidden = Object.keys(process.env).filter(key =>
  /^(DATABASE_URL|APP_URL|SUPABASE_|NEXT_PUBLIC_SUPABASE_|COCKPIT_OWNER_EMAIL|COCKPIT_KEY|COCKPIT_.*_URL|CONFIRM_)/.test(key),
);
if (forbidden.length) {
  throw new Error(`Offline tests refuse configured service credentials: ${forbidden.join(", ")}. Use npm test without an env file.`);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(`Offline tests blocked non-loopback HTTP request to ${url.origin}`);
  }
  return originalFetch(input, init);
};
