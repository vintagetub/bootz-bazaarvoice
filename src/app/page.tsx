import type { Metadata } from "next";
import { MpsHostPage } from "@/components/MpsHostPage";
import { getBrandConfig } from "@/lib/config";

/**
 * The MPS host page at the site root.
 *
 * The Bazaarvoice portal's "MPS host URL" field is configured as the bare
 * domain, so the root has to serve the form itself rather than redirect to
 * `/reviews/submit` — see MpsHostPage for why a redirect is actively harmful
 * here.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Write a review | ${getBrandConfig().name}`,
  robots: { index: false, follow: false },
};

export default function RootPage() {
  return <MpsHostPage />;
}
