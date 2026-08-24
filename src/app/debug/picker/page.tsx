import type { Metadata } from "next";
import { BvDiagnostics } from "@/components/BvDiagnostics";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getBvConfig, getPickerConfig, isRootCategory, isValidExternalId } from "@/lib/config";

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

  const applied: [string, string][] = [
    ["data-bv-campaign-id", defaults.campaignId],
    ["data-bv-category-id", category ?? "(not set — root category)"],
    ["data-bv-family-product-id", family ?? "(not set)"],
    ["data-bv-inline", String(inline)],
    ["data-bv-prevent-close", String(preventClose)],
  ];

  return (
    <>
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
            Compare <code>?category=none</code> with <code>?category=Shower_Base</code>. Renders with
            neither → Product Picker is not enabled for this deployment zone, or nothing in the
            catalog is category-mapped. Renders with <code>none</code> only → the{" "}
            <code>Shower_Base</code> mapping is missing.
          </p>
        </section>

        {loaderUrl === null ? (
          <div className="notice notice--error" role="alert">
            <h2 className="notice__title">Bazaarvoice is not configured</h2>
            <p>Check /api/health for the reason.</p>
          </div>
        ) : (
          <div className="bv-slot">
            <div
              data-bv-show="product_picker"
              data-bv-campaign-id={defaults.campaignId}
              {...(category !== null ? { "data-bv-category-id": category } : {})}
              {...(family !== null ? { "data-bv-family-product-id": family } : {})}
              data-bv-inline={String(inline)}
              data-bv-prevent-close={String(preventClose)}
            />
          </div>
        )}

        <BvDiagnostics loaderUrl={loaderUrl} forceVisible />
      </main>
      <SiteFooter />
    </>
  );
}
