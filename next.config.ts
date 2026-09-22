import type { NextConfig } from "next";
import { assertDemoEnvironment, isDemoDeployment } from "./lib/runtime-mode";
assertDemoEnvironment();

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return isDemoDeployment() ? [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ] }] : [];
  },
  outputFileTracingIncludes: {"/*": ["./certs/supabase-ca.crt"]},
};

export default nextConfig;
