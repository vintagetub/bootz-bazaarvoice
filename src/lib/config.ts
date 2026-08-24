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

const LOADER_HOST = "https://apps.bazaarvoice.com";

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

  const clientNameRaw = read("BV_CLIENT_NAME");
  const clientName = clientNameRaw?.toLowerCase() ?? "";
  if (!clientName) {
    problems.push("BV_CLIENT_NAME is not set.");
  } else if (!CLIENT_NAME_RE.test(clientName)) {
    problems.push(`BV_CLIENT_NAME "${clientName}" is not a valid Bazaarvoice client name.`);
  }

  const siteId = read("BV_SITE_ID") ?? "main_site";
  if (!SITE_ID_RE.test(siteId)) {
    problems.push(`BV_SITE_ID "${siteId}" is not a valid deployment zone ID.`);
  }

  const locale = read("BV_LOCALE") ?? "en_US";
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

export function getBrandConfig(): BrandConfig {
  return {
    name: read("BRAND_NAME") ?? "Bootz",
    logoUrl: read("BRAND_LOGO_URL") ?? null,
    homeUrl: read("BRAND_HOME_URL") ?? null,
  };
}
