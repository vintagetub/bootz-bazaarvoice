import { MpsDiagnostics } from "@/components/MpsDiagnostics";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getBrandConfig, getBvConfig } from "@/lib/config";

/**
 * The Bazaarvoice MPS host page body.
 *
 * Rendered at both `/` and `/reviews/submit` so that whichever one is entered
 * in the Bazaarvoice "MPS host URL" field serves the form directly, with no
 * redirect. A redirect is not merely an extra hop here: Next.js re-encodes the
 * query string when it redirects, so a Bazaarvoice link carrying
 * `products=A,B,C` arrives as `products=A%2CB%2CC`. Anything in bv.js that
 * reads the raw query string rather than decoding it would then see a single
 * product ID named `A%2CB%2CC` and render nothing, with no error to go on.
 *
 * Rendered statically and served from the CDN. Bazaarvoice explicitly does not
 * fail over to their hosted page if this one is unavailable, so there is no
 * per-request work here at all. The `user` and `products` parameters are read by
 * bv.js in the browser, so the server never needs them — which is what keeps
 * the page static.
 */
export function MpsHostPage() {
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
