import type { Metadata, Viewport } from "next";
import { BazaarvoiceLoader } from "@/components/BazaarvoiceLoader";
import { getBrandConfig } from "@/lib/config";
import "./globals.css";

const brand = getBrandConfig();

export const metadata: Metadata = {
  title: `Write a review | ${brand.name}`,
  description: `Rate and review your recent ${brand.name} purchases.`,
  // A review-submission host has nothing to offer search engines, and its URLs
  // carry consumer tokens. Keep it out of the index. public/robots.txt says the
  // same thing at the crawler level.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <BazaarvoiceLoader />
      </head>
      <body>{children}</body>
    </html>
  );
}
