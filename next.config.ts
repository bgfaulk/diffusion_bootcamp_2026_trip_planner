import type { NextConfig } from "next";

// Baseline browser protections. A Content-Security-Policy is left out on purpose: the theme boot script in
// layout.tsx is inline and Next's dev runtime injects its own, so a useful CSP needs nonces via middleware.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=()" }
];

// One identifier per build, baked into both sides: the client bundle sees it as NEXT_PUBLIC_APP_BUILD and
// every /api response carries it as X-App-Build. When they differ, the tab was opened before a redeploy and
// src/lib/client.ts tells the person to reload (see AGENTS.md, "API changes"). Locally it is always "dev".
const appBuild = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
  || process.env.VERCEL_DEPLOYMENT_ID
  || (process.env.NODE_ENV === "production" ? Date.now().toString(36) : "dev");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  env: { NEXT_PUBLIC_APP_BUILD: appBuild },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/api/(.*)", headers: [{ key: "X-App-Build", value: appBuild }] }
    ];
  }
};

export default nextConfig;
