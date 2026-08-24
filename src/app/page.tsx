import type { Metadata } from "next";
import { ProductPickerPage } from "@/components/ProductPickerPage";
import { getBrandConfig } from "@/lib/config";

/**
 * The Product Picker page at the site root.
 *
 * The root is the canonical URL because it is the one the QR codes encode, and
 * a bare domain is the shortest thing to print on a label and the easiest to
 * type by hand off a sticker.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Review your purchase | ${getBrandConfig().name}`,
  robots: { index: false, follow: false },
};

export default function RootPage() {
  return <ProductPickerPage />;
}
