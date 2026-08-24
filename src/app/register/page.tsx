import type { Metadata } from "next";
import { BvDiagnostics } from "@/components/BvDiagnostics";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getBrandConfig, getBvConfig, getPickerConfig } from "@/lib/config";

/**
 * Product Picker landing page — the QR-code entry point.
 *
 * A QR code printed on a physical product cannot carry the `user` and
 * `products` tokens that the MPS form needs, so this flow uses Bazaarvoice's
 * Product Picker instead: the consumer picks their product out of a category
 * and reviews it. Same bv.js loader, different container element.
 *
 * The path is deliberately short so it survives being printed on a label.
 *
 * Reference: https://docs.bazaarvoice.com/articles/#!ratings-reviews/generic_review_submission
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Register and review your purchase | ${getBrandConfig().name}`,
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  const { loaderUrl } = getBvConfig();
  const picker = getPickerConfig();
  const brand = getBrandConfig();

  const usable = loaderUrl !== null && picker.problems.length === 0;

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="page__title">Review your {brand.name} product</h1>
        <p className="page__lede">
          Find your product below and tell us how it is working out. Your review helps other
          homeowners choose with confidence.
        </p>

        {usable ? (
          /*
           * Layout wrapper only — the same rule as the MPS container applies:
           * Bazaarvoice owns everything inside the element it renders into.
           */
          <div className="bv-slot">
            <div
              data-bv-show="product_picker"
              data-bv-campaign-id={picker.campaignId}
              /*
               * Exactly one of these is ever set. Bazaarvoice throws a console
               * error and renders nothing if both are present.
               */
              {...(picker.categoryId !== null ? { "data-bv-category-id": picker.categoryId } : {})}
              {...(picker.familyProductId !== null
                ? { "data-bv-family-product-id": picker.familyProductId }
                : {})}
              data-bv-inline={String(picker.inline)}
              data-bv-prevent-close={String(picker.preventClose)}
            />
          </div>
        ) : (
          <div className="notice notice--error" role="alert">
            <h2 className="notice__title">Product registration is temporarily unavailable</h2>
            <p>Sorry — we can&apos;t load the form right now. Please try again later.</p>
            <span
              hidden
              data-bv-config-problems={[...getBvConfig().problems, ...picker.problems].join(" | ")}
            />
          </div>
        )}

        <BvDiagnostics app="product_picker" loaderUrl={loaderUrl} />
      </main>
      <SiteFooter />
    </>
  );
}
