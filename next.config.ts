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
   * Bazaarvoice auto-redirects existing Review Request Email links to this
   * domain and the form will not render without the `user` and `products`
   * query parameters, so every alias has to land on the real page with its
   * query string intact. Next.js forwards query parameters on redirects when
   * the destination declares none of its own, which is the case here.
   */
  async redirects() {
    return [
      { source: "/", destination: "/reviews/submit", permanent: false },
      { source: "/reviews", destination: "/reviews/submit", permanent: false },
      { source: "/submit", destination: "/reviews/submit", permanent: false },
      // Product Picker (QR) entry point lives at the short /register path.
      { source: "/reviews/register", destination: "/register", permanent: false },
    ];
  },
};

export default nextConfig;
