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
   * Deliberately NO redirect for the MPS host page.
   *
   * `/` and `/reviews/submit` are both real pages rendering the same body, so
   * whichever is entered in the Bazaarvoice portal serves the form directly.
   * Redirecting would re-encode the query string — `products=A,B,C` becomes
   * `products=A%2CB%2CC` — and the form renders nothing if bv.js reads those
   * values without decoding them.
   *
   * The aliases below are convenience only; nothing in Bazaarvoice points at
   * them, so the re-encoding does not matter on these paths.
   */
  async redirects() {
    return [
      { source: "/reviews", destination: "/", permanent: false },
      { source: "/submit", destination: "/", permanent: false },
      // Product Picker (QR) entry point lives at the short /register path.
      { source: "/reviews/register", destination: "/register", permanent: false },
    ];
  },
};

export default nextConfig;
