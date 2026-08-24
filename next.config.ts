import type { NextConfig } from "next";
import { buildCsp, getCspMode } from "./src/lib/csp";

const cspMode = getCspMode();
const csp = buildCsp();

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ...(cspMode === "off"
    ? []
    : [
        {
          key: cspMode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
          value: csp,
        },
      ]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  /**
   * No redirects.
   *
   * `/` and `/register` are both real pages serving the Product Picker, so a QR
   * code or printed link using either path works without a hop. Redirects are
   * avoided on the entry-point paths on principle: Next.js re-encodes the query
   * string when it redirects, and a printed URL is not something we can fix
   * after the fact if that ever matters.
   */
};

export default nextConfig;
