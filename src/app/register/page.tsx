import type { Metadata } from "next";
import { ProductPickerPage } from "@/components/ProductPickerPage";
import { getBrandConfig } from "@/lib/config";

/**
 * The same Product Picker page at `/register`.
 *
 * A real page rather than a redirect to `/`, so that a QR code or printed link
 * already carrying this path keeps working, and so the descriptive URL can be
 * used where there is room for it.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Review your purchase | ${getBrandConfig().name}`,
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return <ProductPickerPage />;
}
