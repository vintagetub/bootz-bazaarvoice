import type { Metadata } from "next";
import { BvDiagnostics } from "@/components/BvDiagnostics";
import { BvErrorCapture } from "@/components/BvErrorCapture";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import {
  getBvConfig,
  getPickerConfig,
  getSubmissionConfigUrl,
  isRootCategory,
  isValidExternalId,
} from "@/lib/config";

/**
 * Operator-only scratchpad for narrowing down an empty Product Picker.
 *
 * The production pages bake their category in at build time, which makes
 * "does it render with a different scope?" a redeploy to answer. This route is
 * rendered per request so the scope can be changed from the URL:
 *
 *   /debug/picker?category=none        root category — every mapped product
 *   /debug/picker?category=Shower_Base a specific category ExternalId
 *   /debug/picker?family=BZ-4832       a product family instead
 *   /debug/picker?inline=false         lightbox rather than in-page
 *
 * The useful comparison is `category=none` against `category=Shower_Base`.
 * Renders with neither → Product Picker is not really enabled for this
 * deployment zone, or the catalog has no mapped categories at all. Renders with
 * none but not with Shower_Base → that one category is the problem.
 *
 * Not linked from anywhere and noindex, but it is publicly reachable, so it
 * deliberately exposes nothing an operator could not read off the page source
 * of the production pages anyway.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Product Picker debug",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed === "" ? undefined : trimmed;
}

export default async function DebugPickerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const defaults = getPickerConfig();
  const { loaderUrl } = getBvConfig();

  const notes: string[] = [];

  const familyParam = first(params.family);
  const categoryParam = first(params.category);

  let family: string | null = null;
  if (familyParam !== undefined) {
    if (isValidExternalId(familyParam)) {
      family = familyParam;
    } else {
      notes.push(`Ignored family="${familyParam}" — not a valid ExternalId.`);
    }
  }

  let category: string | null = null;
  if (family !== null) {
    if (categoryParam !== undefined) {
      notes.push("Ignored category — mutually exclusive with family, and family was given.");
    }
  } else if (categoryParam === undefined) {
    category = defaults.categoryId;
    notes.push("No category given; using the configured default.");
  } else if (isRootCategory(categoryParam)) {
    notes.push("Root category: no data-bv-category-id, so every mapped product is offered.");
  } else if (isValidExternalId(categoryParam)) {
    category = categoryParam;
  } else {
    category = defaults.categoryId;
    notes.push(`Ignored category="${categoryParam}" — not a valid ExternalId.`);
  }

  const inline = first(params.inline) !== "false";
  const preventClose = first(params.preventClose) === "true";

  /**
   * `?minimal=1` emits Bazaarvoice's documented root-category example and
   * nothing else: `<div data-bv-show="product_picker"></div>`. If that renders
   * when the fuller markup does not, one of our other attributes is at fault —
   * `data-bv-campaign-id` being the candidate, since Bazaarvoice's docs hint
   * that campaign IDs may need to exist on the account.
   */
  const minimal = first(params.minimal) === "1";

  /**
   * `?crossorigin=1` unmasks "Script error." — see BazaarvoiceLoader. If bv.js
   * stops loading entirely with this set, Bazaarvoice's CDN does not send
   * Access-Control-Allow-Origin and the real message cannot be read this way.
   */
  const crossOriginParam = first(params.crossorigin);
  const crossOrigin = crossOriginParam === "1" || crossOriginParam === "all";
  /**
   * `?crossorigin=all` also forces CORS onto the scripts bv.js injects. The
   * top-level loader carrying the attribute is not enough: an exception thrown
   * inside a child script is masked by that child's own CORS status.
   */
  const forceCrossOriginOnInjected = crossOriginParam === "all";

  /**
   * `?mode=ui` uses Bazaarvoice's programmatic entry point,
   * BV.ui("rr","submit_generic",...), instead of a data-bv-show container.
   *
   * Two reasons it is worth trying. The declarative container depends on
   * `product_picker` being a registered app in this deployment's bv.js bundle;
   * BV.ui may reach the same implementation inside swat-submission without that
   * registration. And because we make the call ourselves, we can wrap it —
   * CORS masks uncaught errors only, so a caught exception gives up its real
   * message and stack whatever the script's origin.
   */
  const uiMode = first(params.mode) === "ui";

  const applied: [string, string][] = uiMode
    ? [
        ["entry point", 'BV.ui("rr","submit_generic",{...}) — no container element'],
        ["campaignId", defaults.campaignId],
        ["categoryId", category ?? "(omitted — root category)"],
        ["familyProductId", family ?? "(omitted)"],
        ["inline", String(inline)],
        ["preventClose", String(preventClose)],
      ]
    : minimal
    ? [["data-bv-show", "product_picker (and nothing else)"]]
    : [
        ["data-bv-campaign-id", defaults.campaignId],
        ["data-bv-category-id", category ?? "(not set — root category)"],
        ["data-bv-family-product-id", family ?? "(not set)"],
        ["data-bv-inline", String(inline)],
        ["data-bv-prevent-close", String(preventClose)],
      ];

  return (
    <>
      {/*
        * Installs the instrumentation and then loads bv.js itself, so the
        * patches are guaranteed to be in place first. This is why the debug
        * route does not render BazaarvoiceLoader.
        */}
      <BvErrorCapture
        crossOrigin={crossOrigin}
        forceCrossOriginOnInjected={forceCrossOriginOnInjected}
        uiCall={
          uiMode
            ? {
                campaignId: defaults.campaignId,
                categoryId: category,
                familyProductId: family,
                inline,
                preventClose,
              }
            : null
        }
      />
      <SiteHeader />
      <main className="page">
        <h1 className="page__title">Product Picker debug</h1>
        <p className="page__lede">
          Operator tool. Change the scope from the query string to work out why the picker is empty.
        </p>

        <section className="diagnostics" aria-label="Applied picker configuration">
          <h2 className="diagnostics__title">Applied to the container</h2>
          <dl>
            {applied.map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {notes.length > 0 ? (
            <p className="diagnostics__hint">{notes.join(" ")}</p>
          ) : null}
          <p className="diagnostics__hint">
            Try <code>?mode=ui</code> first: it calls BV.ui directly and reports the real error
            message even when CORS masks it. Scopes:{" "}<code>?minimal=1</code> (Bazaarvoice&apos;s bare documented example),{" "}
            <code>?category=none</code> (root category), <code>?category=Shower_Base</code>. Add{" "}
            <code>&amp;crossorigin=1</code> to unmask an error thrown by bv.js itself, or{" "}
            <code>&amp;crossorigin=all</code> to also unmask errors thrown inside the scripts bv.js
            injects. The blocks below show what bv.js actually did.
          </p>
          {crossOrigin ? (
            <p className="diagnostics__hint">
              <strong>
                CORS unmasking is on{forceCrossOriginOnInjected ? " for injected scripts too" : ""}.
              </strong>{" "}
              If &ldquo;Bazaarvoice global&rdquo; now reads <em>not set</em> and a resource-failed
              entry appears, that script is not served with CORS headers and its error cannot be
              unmasked this way.
            </p>
          ) : null}
        </section>

        {loaderUrl === null ? (
          <div className="notice notice--error" role="alert">
            <h2 className="notice__title">Bazaarvoice is not configured</h2>
            <p>Check /api/health for the reason.</p>
          </div>
        ) : (
          <div className="bv-slot">
            {uiMode ? (
              /* BV.ui builds its own element; a second container would be a
                 duplicate app on the page. */
              <div id="bv-ui-target" />
            ) : minimal ? (
              <div data-bv-show="product_picker" />
            ) : (
              <div
                data-bv-show="product_picker"
                data-bv-campaign-id={defaults.campaignId}
                {...(category !== null ? { "data-bv-category-id": category } : {})}
                {...(family !== null ? { "data-bv-family-product-id": family } : {})}
                data-bv-inline={String(inline)}
                data-bv-prevent-close={String(preventClose)}
              />
            )}
          </div>
        )}

        <BvDiagnostics loaderUrl={loaderUrl} configUrl={getSubmissionConfigUrl()} forceVisible />
      </main>
      <SiteFooter />
    </>
  );
}
