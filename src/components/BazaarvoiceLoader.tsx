import { getBvConfig } from "@/lib/config";

/**
 * Loads the Bazaarvoice library.
 *
 * This is step 1 of Bazaarvoice's site-hosted Product Picker instructions,
 * verbatim: one async script tag for bv.js. React 19 hoists `<script async src>`
 * into `<head>`, which is where Bazaarvoice wants it.
 *
 * There is no `window.bvCallback` here. That hook exists to attach listeners to
 * Bazaarvoice submission events, and Bazaarvoice documents no such event for
 * Product Picker — the only documented one, `mpsClose`, belongs to
 * Multi-Product Submission. Adding the hook to fire nothing would be dead code
 * that implies a feature we do not have. If a post-submission callback is needed
 * later, `window.bvCallback` is the integration point, and it must be defined
 * before bv.js executes.
 *
 * Bazaarvoice's docs are explicit that bv.js is added exactly once per page;
 * rendering this component once in the root layout satisfies that for every
 * route.
 *
 * Reference: https://docs.bazaarvoice.com/articles/#!ratings-reviews/generic_review_submission
 *            https://docs.bazaarvoice.com/articles/ratings-reviews/bv-pixel-implementation-bv-js/a/add-the-bv-loader
 */
export function BazaarvoiceLoader() {
  const { loaderUrl } = getBvConfig();

  if (!loaderUrl) return null;

  return (
    <>
      {/* Shave the DNS + TLS handshake off the loader fetch. */}
      <link rel="preconnect" href="https://apps.bazaarvoice.com" />
      {/* load BV loader */}
      <script async src={loaderUrl} />
    </>
  );
}
