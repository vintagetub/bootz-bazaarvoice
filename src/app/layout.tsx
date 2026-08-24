import type { Metadata, Viewport } from "next";
import { getBrandConfig } from "@/lib/config";
import "./globals.css";

const brand = getBrandConfig();

export const metadata: Metadata = {
  title: `Review your purchase | ${brand.name}`,
  description: `Rate and review your recent ${brand.name} purchases.`,
  // A review-submission host has nothing to offer search engines. Keep it out of
  // the index; public/robots.txt says the same at the crawler level.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * The Bazaarvoice loader is rendered by each page rather than here, so the debug
 * route can load bv.js with `crossorigin="anonymous"` while the consumer pages
 * do not. Every page still renders it exactly once, which is what Bazaarvoice's
 * add-it-once rule requires. React hoists `<script async src>` into `<head>`
 * regardless of where in the tree it is rendered.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
