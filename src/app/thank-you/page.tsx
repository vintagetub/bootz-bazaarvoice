import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getBrandConfig } from "@/lib/config";

/** Landing page for the `mpsClose` redirect. */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Thanks for your review | ${getBrandConfig().name}`,
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
  const brand = getBrandConfig();

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="page__title">Thanks for your review</h1>
        <p className="page__lede">
          Your feedback is on its way to our team. Reviews are typically published within a few days,
          once they have been checked against our review guidelines.
        </p>
        {brand.homeUrl ? (
          <a className="button" href={brand.homeUrl}>
            Continue shopping
          </a>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
