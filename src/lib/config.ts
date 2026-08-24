/**
 * Resolves the Bazaarvoice + brand configuration from environment variables.
 *
 * All values are read server-side only. Nothing here is exposed as a
 * NEXT_PUBLIC_ variable: the loader URL is rendered into the HTML by a server
 * component, which is the only place it is needed.
 *
 * Reference: https://docs.bazaarvoice.com/articles/#!ratings-reviews/host-the-mps-form-on-your-domain
 *            https://docs.bazaarvoice.com/articles/ratings-reviews/bv-pixel-implementation-bv-js/a/add-the-bv-loader
 */

export type BvEnvironment = "staging" | "production";
export type RedirectOnClose = "completed" | "always" | "never";

export interface BvConfig {
  /** Bazaarvoice client name, lowercase. */
  clientName: string;
  /** Deployment zone ID. Bazaarvoice's default zone is `main_site`. */
  siteId: string;
  /** `staging` or `production` — must match the domain the page is served from. */
  environment: BvEnvironment;
  /** Locale code, e.g. `en_US`. */
  locale: string;
  /** Fully-resolved bv.js loader URL, or null when configuration is invalid. */
  loaderUrl: string | null;
  /** True when the OneTrust cookie-consent integration is enabled in Bazaarvoice. */
  cookieConsent: boolean;
  /** Empty when the configuration is usable. */
  problems: string[];
}

export interface MpsBehaviour {
  /** When to send the consumer to the thank-you page after `mpsClose`. */
  redirectOnClose: RedirectOnClose;
  /** Same-origin path the consumer lands on. */
  thankYouPath: string;
}

export interface BrandConfig {
  name: string;
  logoUrl: string | null;
  homeUrl: string | null;
}

/**
 * Product Picker settings, for the QR-code entry point.
 *
 * Separate app from MPS: Product Picker lets a consumer choose the product
 * themselves, which is the only workable flow when the link comes off a
 * physical product and carries no `user`/`products` tokens.
 *
 * Reference: https://docs.bazaarvoice.com/articles/#!ratings-reviews/generic_review_submission
 */
export interface PickerConfig {
  /** Segments submissions in Bazaarvoice reporting. */
  campaignId: string;
  /** Category `ExternalId` from the product feed. Mutually exclusive with `familyProductId`. */
  categoryId: string | null;
  /** Product family `ExternalId`. Mutually exclusive with `categoryId`. */
  familyProductId: string | null;
  /** `false` renders the picker in a lightbox instead of in the page. */
  inline: boolean;
  /** `true` removes the lightbox close button. Ignored when `inline` is true. */
  preventClose: boolean;
  problems: string[];
}

const LOADER_HOST = "https://apps.bazaarvoice.com";

/** Bazaarvoice account values, confirmed by the Bootz implementation team. */
const DEFAULT_CLIENT_NAME = "bootz";
const DEFAULT_SITE_ID = "main_site";
const DEFAULT_LOCALE = "en_US";
const DEFAULT_CAMPAIGN_ID = "bootz_qr_registration";
const DEFAULT_CATEGORY_ID = "Shower_Base";

/** Bazaarvoice client names are lowercase alphanumerics with `-`/`_`. */
const CLIENT_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
/** Deployment zone IDs, e.g. `main_site`, `mobile`. */
const SITE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Bazaarvoice locale codes, e.g. `en_US`, `fr_CA`. */
const LOCALE_RE = /^[a-z]{2}_[A-Z]{2}$/;
/**
 * A single-slash-rooted, same-origin path. Rejects `//evil.com` and
 * `https://evil.com` (open redirect) and restricts the character set so the
 * value is safe to inline into a script literal.
 */
const THANK_YOU_PATH_RE = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@/?%]*$/;
/** Bazaarvoice: "up to 255 alphanumeric characters (including underscores)". */
const CAMPAIGN_ID_RE = /^\w{1,255}$/;
/** Catalog `ExternalId` values. Bazaarvoice allows alphanumerics plus `_`, `-`, `.`. */
const EXTERNAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

function read(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = read(name);
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

/**
 * Derives the Bazaarvoice `environment` path segment.
 *
 * Bazaarvoice's verification step tells you to confirm this matches the domain
 * you are serving from, so an explicit `BV_ENVIRONMENT` always wins. Otherwise
 * only a Vercel Production deployment is treated as `production` — previews and
 * local development fall back to `staging`, which is the safe direction to be
 * wrong in (staging traffic never lands in the production review pipeline).
 */
function resolveEnvironment(problems: string[]): BvEnvironment {
  const explicit = read("BV_ENVIRONMENT")?.toLowerCase();
  if (explicit === "staging" || explicit === "production") return explicit;
  if (explicit !== undefined) {
    problems.push(
      `BV_ENVIRONMENT must be "staging" or "production" (got "${explicit}"); falling back to staging.`,
    );
  }
  return read("VERCEL_ENV") === "production" ? "production" : "staging";
}

export function getBvConfig(): BvConfig {
  const problems: string[] = [];

  const clientName = (read("BV_CLIENT_NAME") ?? DEFAULT_CLIENT_NAME).toLowerCase();
  if (!CLIENT_NAME_RE.test(clientName)) {
    problems.push(`BV_CLIENT_NAME "${clientName}" is not a valid Bazaarvoice client name.`);
  }

  const siteId = read("BV_SITE_ID") ?? DEFAULT_SITE_ID;
  if (!SITE_ID_RE.test(siteId)) {
    problems.push(`BV_SITE_ID "${siteId}" is not a valid deployment zone ID.`);
  }

  const locale = read("BV_LOCALE") ?? DEFAULT_LOCALE;
  if (!LOCALE_RE.test(locale)) {
    problems.push(`BV_LOCALE "${locale}" is not a valid Bazaarvoice locale code (expected e.g. en_US).`);
  }

  const environment = resolveEnvironment(problems);
  const cookieConsent = readBoolean("BV_COOKIE_CONSENT", false);

  // Never emit a half-formed loader URL: a 404 on bv.js is harder to diagnose
  // than an explicit configuration error on the page.
  const loaderUrl =
    problems.length === 0
      ? `${LOADER_HOST}/deployments/${clientName}/${siteId}/${environment}/${locale}/bv.js`
      : null;

  return { clientName, siteId, environment, locale, loaderUrl, cookieConsent, problems };
}

export function getMpsBehaviour(): MpsBehaviour {
  const raw = read("MPS_REDIRECT_ON_CLOSE")?.toLowerCase();
  const redirectOnClose: RedirectOnClose =
    raw === "always" || raw === "never" || raw === "completed" ? raw : "completed";

  // Must be a same-origin absolute path: the inline callback assigns it
  // straight to window.location.href, so a protocol-relative or absolute URL
  // here would be an open redirect. The character allowlist also keeps the
  // value safe to embed in that inline script.
  const configured = read("MPS_THANK_YOU_PATH") ?? "/thank-you";
  const thankYouPath = THANK_YOU_PATH_RE.test(configured) ? configured : "/thank-you";

  return { redirectOnClose, thankYouPath };
}

/**
 * Resolves the Product Picker settings.
 *
 * `categoryId` and `familyProductId` are mutually exclusive — Bazaarvoice's docs
 * warn that passing both throws a console error and the picker fails to render.
 * Rather than emit that broken markup, an explicit family ID wins and the
 * category is dropped, which is reported in `problems`.
 */
export function getPickerConfig(): PickerConfig {
  const problems: string[] = [];

  const campaignId = read("BV_PICKER_CAMPAIGN_ID") ?? DEFAULT_CAMPAIGN_ID;
  if (!CAMPAIGN_ID_RE.test(campaignId)) {
    problems.push(
      `BV_PICKER_CAMPAIGN_ID "${campaignId}" must be 1-255 alphanumeric characters or underscores.`,
    );
  }

  const familyProductId = read("BV_PICKER_FAMILY_PRODUCT_ID") ?? null;
  if (familyProductId !== null && !EXTERNAL_ID_RE.test(familyProductId)) {
    problems.push(`BV_PICKER_FAMILY_PRODUCT_ID "${familyProductId}" is not a valid ExternalId.`);
  }

  let categoryId: string | null = null;
  if (familyProductId === null) {
    categoryId = read("BV_PICKER_CATEGORY_ID") ?? DEFAULT_CATEGORY_ID;
    if (!EXTERNAL_ID_RE.test(categoryId)) {
      problems.push(`BV_PICKER_CATEGORY_ID "${categoryId}" is not a valid ExternalId.`);
    }
  } else if (read("BV_PICKER_CATEGORY_ID") !== undefined) {
    problems.push(
      "BV_PICKER_CATEGORY_ID and BV_PICKER_FAMILY_PRODUCT_ID are mutually exclusive; " +
        "the family product ID was used and the category was ignored.",
    );
  }

  return {
    campaignId,
    categoryId,
    familyProductId,
    inline: readBoolean("BV_PICKER_INLINE", true),
    preventClose: readBoolean("BV_PICKER_PREVENT_CLOSE", false),
    problems,
  };
}

export function getBrandConfig(): BrandConfig {
  return {
    name: read("BRAND_NAME") ?? "Bootz",
    logoUrl: read("BRAND_LOGO_URL") ?? null,
    homeUrl: read("BRAND_HOME_URL") ?? null,
  };
}
