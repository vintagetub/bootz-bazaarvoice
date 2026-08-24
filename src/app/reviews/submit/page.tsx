import type { Metadata } from "next";
import { MpsDiagnostics } from "@/components/MpsDiagnostics";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getBrandConfig, getBvConfig } from "@/lib/config";

/**
 * The Bazaarvoice MPS host page.
 *
 * This is the URL that goes into the "MPS host URL" / "MPS staging host URL"
 * fields in the Bazaarvoice configuration.
 *
 * Rendered statically and served from the CDN. Bazaarvoice explicitly does not
 * fail over to their hosted page if this one is unavailable, so there is no
 * per-request work here at all. The `user` and `products` query parameters are
 * read by bv.js in the browser, so no server-side access to them is needed —
 * which is what keeps the page static.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Write a review | ${getBrandConfig().name}`,
  robots: { index: false, follow: false },
};

export default function SubmitReviewPage() {
  const { loaderUrl, environment, problems } = getBvConfig();
  const brand = getBrandConfig();

  return (
    <>
      <SiteHeader />
      <main className="page">
        <h1 className="page__title">Write a review</h1>
        <p className="page__lede">
          Tell other shoppers what you think of your recent {brand.name} purchases. It only takes a
          minute.
        </p>

        {loaderUrl === null ? (
          <ConfigurationError problems={problems} />
        ) : (
          /*
           * Layout wrapper only. Bazaarvoice's docs: "Do not apply custom
           * styles, padding, or margins directly to this div. Bazaarvoice
           * manages all layout and styling within the container."
           */
          <div className="bv-slot">
            <div data-bv-show="multi_submission" />
          </div>
        )}

        <MpsDiagnostics loaderUrl={loaderUrl} />
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
 * Shown instead of the container when the loader URL cannot be built. Rendering
 * a broken bv.js URL would fail silently; this fails loudly on staging while
 * still showing consumers something coherent.
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
