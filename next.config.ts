import type { NextConfig } from "next";

/**
 * Baseline security headers (audit finding, 2026-09-02 - none were set at
 * all before). A full Content-Security-Policy is deliberately left out of
 * this pass rather than guessed at - Next's own hydration scripts and
 * Tailwind's injected styles need a CSP tuned against the app's actual
 * rendered output (nonces/hashes), and a wrong CSP silently breaks pages
 * instead of failing loudly, which is worse than the gap it would close.
 * The headers below carry no risk of breaking anything the app does.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework in an X-Powered-By header on every response.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Every API response is per-user data; keep it out of any shared or browser cache.
        // /api/files/view is left alone: it sets its own private, cacheable header so photos are not re-downloaded on every view.
        source: "/api/:path((?!files/view).*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
