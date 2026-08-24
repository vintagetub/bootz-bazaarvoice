/**
 * Content Security Policy for the Product Picker host pages.
 *
 * Derived from Bazaarvoice's own CSP reference for V2 applications:
 * https://docs.bazaarvoice.com/articles/ratings-reviews/csp-support-for-v2-applications
 *
 * Deliberate deviations from that reference are marked inline. This module is
 * imported by `next.config.ts`, so it must stay free of Next.js/React imports.
 */

export type CspMode = "enforce" | "report-only" | "off";

const BV = "https://*.bazaarvoice.com";
/** Bazaarvoice's device-fingerprinting vendor (iovation), used during submission. */
const IOVATION = ["https://mpsnare.iesnare.com", "wss://mpsnare.iesnare.com"];
/** OneTrust, when the Bazaarvoice cookie-consent integration is enabled. */
const ONETRUST = "https://cdn.cookielaw.org";

/**
 * Bazaarvoice's published `script-src-elem` list also includes
 * `edge.curalate.com`, `uk.cdn-net.com`, and `six.cdn-net.com`. They are left
 * out here because they belong to products we do not use (Curalate is
 * Contextual Commerce), and a policy should not permit hosts a page has no
 * reason to contact.
 *
 * If a `csp-blocked` entry ever names one of them, add it via
 * CSP_EXTRA_SCRIPT_SRC rather than guessing — the diagnostics capture on
 * /debug/picker reports the exact directive and blocked URI.
 */

function envList(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(/[\s,]+/).filter(Boolean);
}

export function getCspMode(): CspMode {
  const raw = process.env.CSP_MODE?.trim().toLowerCase();
  if (raw === "off" || raw === "report-only") return raw;
  return "enforce";
}

/**
 * Builds the policy string.
 *
 * `script-src` includes `'unsafe-inline'` because Next.js emits inline
 * bootstrap/RSC-payload scripts and we emit the inline `window.bvCallback`
 * definition that has to run before bv.js. Bazaarvoice's published example uses
 * a sha256 hash instead — but a hash and `'unsafe-inline'` cannot coexist
 * (browsers ignore `'unsafe-inline'` once any hash or nonce is present), and
 * Next.js's inline scripts change per build, so hashing them is not workable
 * for a statically-rendered page. See README ("Tightening the CSP") for the
 * nonce-based alternative and what it costs.
 */
export function buildCsp(options?: { cookieConsent?: boolean }): string {
  const cookieConsent =
    options?.cookieConsent ??
    ["1", "true", "yes", "on"].includes((process.env.BV_COOKIE_CONSENT ?? "").trim().toLowerCase());

  const consentScript = cookieConsent ? [ONETRUST] : [];
  // Not in Bazaarvoice's table, but OneTrust's banner fetches geolocation and
  // consent-logging endpoints; without these the banner blocks the form.
  const consentConnect = cookieConsent ? [ONETRUST, "https://geolocation.onetrust.com"] : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'", BV],
    "script-src": ["'self'", "'unsafe-inline'", BV, ...IOVATION, ...consentScript, ...envList("CSP_EXTRA_SCRIPT_SRC")],
    "script-src-elem": ["'self'", "'unsafe-inline'", BV, ...IOVATION, ...consentScript, ...envList("CSP_EXTRA_SCRIPT_SRC")],
    "style-src": ["'self'", "'unsafe-inline'", BV, ...envList("CSP_EXTRA_STYLE_SRC")],
    "style-src-elem": ["'self'", "'unsafe-inline'", BV, ...envList("CSP_EXTRA_STYLE_SRC")],
    "manifest-src": ["'self'", BV],
    // 'self' added to Bazaarvoice's list so our own favicon/logo assets load.
    "img-src": ["'self'", BV, "blob:", "data:", ...consentScript, ...envList("CSP_EXTRA_IMG_SRC")],
    "connect-src": ["'self'", BV, ...IOVATION, ...consentConnect, ...envList("CSP_EXTRA_CONNECT_SRC")],
    "media-src": ["'self'", BV, ...IOVATION, "blob:", "data:"],
    "object-src": ["'self'", BV],
    // YouTube is here because reviewers can attach a YouTube video to a review.
    "frame-src": ["'self'", BV, "https://www.youtube.com", ...envList("CSP_EXTRA_FRAME_SRC")],
    "font-src": ["'self'", BV, "data:"],
    // Not in Bazaarvoice's table; hardening for a page that handles consumer input.
    "base-uri": ["'self'"],
    "form-action": ["'self'", BV],
    "frame-ancestors": ["'self'"],
  };

  const serialised = Object.entries(directives)
    .map(([name, sources]) => `${name} ${dedupe(sources).join(" ")}`)
    .join("; ");

  return `${serialised}; upgrade-insecure-requests`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
