import { BvDiagnostics } from "@/components/BvDiagnostics";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getBrandConfig, getBvConfig, getPickerConfig } from "@/lib/config";

/**
 * The Bazaarvoice Product Picker host page.
 *
 * Product Picker lets the consumer choose which product they are reviewing,
 * which is the only workable flow when the link comes off a physical product
 * and so carries no order, no known consumer, and no product IDs.
 *
 * Unlike Multi-Product Submission, Product Picker has no URL field in the
 * Bazaarvoice portal and needs no custom-domain setting — it is simply a page on
 * our domain carrying bv.js and the container element. We link to it ourselves.
 *
 * Rendered statically and served from the CDN: the page takes no query
 * parameters and does no per-request work, and a static page is materially more
 * available than a per-request render.
 *
 * Reference: https://docs.bazaarvoice.com/articles/#!ratings-reviews/generic_review_submission
 */
export function ProductPickerPage() {
  const { loaderUrl, environment, problems } = getBvConfig();
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
           * Layout wrapper only. Bazaarvoice manages all layout and styling
           * within the container element, and their docs are explicit that it
           * must not receive custom styles, padding, or margins.
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
          <ConfigurationError problems={[...problems, ...picker.problems]} />
        )}

        <BvDiagnostics loaderUrl={loaderUrl} />
        {environment !== "production" ? (
          <p className="diagnostics__hint" style={{ marginTop: "1.5rem" }}>
            Bazaarvoice environment: <strong>{environment}</strong>
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * Shown instead of the container when the configuration is unusable. Emitting a
 * broken bv.js URL or a both-attributes container would fail silently; this
 * fails loudly on staging while still showing consumers something coherent.
 */
function ConfigurationError({ problems }: { problems: string[] }) {
  return (
    <div className="notice notice--error" role="alert">
      <h2 className="notice__title">Reviews are temporarily unavailable</h2>
      <p>Sorry — we can&apos;t load the review form right now. Please try again later.</p>
      {/* Operator-facing detail, not rendered as visible text. */}
      <span hidden data-bv-config-problems={problems.join(" | ")} />
    </div>
  );
}
