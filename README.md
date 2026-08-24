# Bootz — Bazaarvoice MPS host

A small Next.js app that hosts the Bazaarvoice **Multi-Product Submission (MPS)** form on our own
domain, so consumers arriving from a Review Request Email stay on a Bootz URL instead of being
redirected to a Bazaarvoice-hosted page.

Built to Bazaarvoice's guide:
[Host MPS form on custom domains](https://docs.bazaarvoice.com/articles/#!ratings-reviews/host-the-mps-form-on-your-domain).

---

## What you still need to fill in

The app is complete but **cannot render the form until these values are set**. Everything is read
from environment variables — no code changes needed.

| Value | Env var | Where to get it |
| --- | --- | --- |
| Bazaarvoice client name (lowercase) | `BV_CLIENT_NAME` | Bazaarvoice implementation team, or read it out of the `bv.js` URL already on the storefront |
| Deployment zone ID | `BV_SITE_ID` | Bazaarvoice portal → **Site Manager** → the icon to the right of the deployment zone. Default is `main_site` |
| Locale | `BV_LOCALE` | `en_US` unless we are collecting in another locale |
| Cookie consent on? | `BV_COOKIE_CONSENT` | `true` only if the Bazaarvoice OneTrust integration is enabled for our account |
| Production URL | — | The domain to deploy to, e.g. `https://reviews.bootzindustries.com`. Goes in the Bazaarvoice **MPS host URL** field |
| Staging URL | — | e.g. `https://reviews-staging.bootzindustries.com`. Goes in **MPS staging host URL** |
| Brand assets | `BRAND_NAME`, `BRAND_LOGO_URL`, `BRAND_HOME_URL` | Logo URL and storefront homepage |

Copy `.env.example` to `.env.local` for local work, and set the same variables in the Vercel project
for each environment.

### Also needs a request to Bazaarvoice Support

Three things can only be changed on Bazaarvoice's side:

1. Turn **Enable Multi-Product Submission on Custom Domain** to **ON**.
2. Set **MPS host URL** (production) and **MPS staging host URL** to the deployed URLs.
3. Select the **Inline** display mode. (The page markup is identical for Popup and Inline — only
   Bazaarvoice's configuration decides which you get. This app's layout is built for Inline.)

Also confirm our domains are on the Bazaarvoice allowlist, or bv.js will refuse to initialise.

---

## How it works

The whole integration is three things on one page:

1. **The loader.** `src/components/BazaarvoiceLoader.tsx` renders one inline script into `<head>`
   that defines `window.bvCallback` and *then* injects
   `https://apps.bazaarvoice.com/deployments/<client>/<site>/<environment>/<locale>/bv.js`.

   Both jobs live in one script deliberately. bv.js calls `window.bvCallback` as soon as the library
   is ready, so the callback must already exist. Two sibling tags do not guarantee that: React 19
   hoists `<script async src>` to the top of `<head>`, above any inline script a layout renders, and
   an `async` script served from a warm cache can execute before the parser reaches a later inline
   block. Creating the tag from inside the script that defines the callback makes the order
   unconditional.

2. **The container.** `src/app/reviews/submit/page.tsx` renders
   `<div data-bv-show="multi_submission" />`. Bazaarvoice manages everything inside it.

   **Do not style this div** — no classes, padding, or margins, per Bazaarvoice's docs. The
   `.bv-slot` wrapper around it carries the page layout instead, and a test asserts the div's
   computed padding/margin stay at zero.

3. **The close handler.** The inline script attaches
   `BV.swat_submission.on('mpsClose', …)`. By default it redirects to `/thank-you` only when
   `data.completed` is true, and it always re-broadcasts a `bootz:mpsClose` DOM event so analytics
   can listen without touching this code.

### Query parameters are load-bearing

The form renders **nothing** if `user` and `products` are missing from the URL. Any redirect or
rewrite that drops the query string silently breaks the whole flow.

`/`, `/reviews`, and `/submit` all redirect to `/reviews/submit` with the query string preserved, so
a link that lands slightly off target still works. There is a test for each. If you add a redirect,
a proxy rule, or a CDN rewrite in front of this app, verify the query string survives it.

### Routes

| Route | Purpose |
| --- | --- |
| `/reviews/submit` | The MPS host page. **This is the URL that goes in the Bazaarvoice portal.** |
| `/thank-you` | Landing page for the `mpsClose` redirect |
| `/api/health` | Uptime probe. `200` when configured, `503` with a reason when not |
| `/robots.txt` | Disallows everything — these URLs carry consumer tokens |

---

## Availability

Bazaarvoice does **not** fail over to their hosted page if this app is down; consumers just get a
broken link. Two consequences shaped the build:

- **Both pages are statically rendered** (`force-static`) and served from Vercel's CDN. There is no
  per-request work — the `user` and `products` parameters are read by bv.js in the browser, so the
  server never needs them. This is also why the diagnostics panel reads the URL client-side.
- **Point an uptime monitor at `/api/health`.** It returns `503` when the Bazaarvoice configuration
  is unusable, which catches the failure mode a plain 200-check misses: a deployment that serves a
  perfectly healthy page which can never render the form.

If the app has to come down, contact Bazaarvoice Support to temporarily revert to Bazaarvoice
hosting.

### Configuration is baked in at build time

`BV_*`, `BRAND_*`, and `CSP_*` are read during `next build` — the loader URL is compiled into the
static HTML and the CSP into the routes manifest. **Changing an env var in Vercel does nothing until
you redeploy.**

One wrinkle to know about: `/api/health` is dynamic, so it reads env vars at *runtime*. If someone
changes a variable without redeploying, health will report the new value while the page still serves
the old one. If health and the page disagree, redeploy.

---

## Content Security Policy

Defaults follow
[Bazaarvoice's CSP reference for V2 applications](https://docs.bazaarvoice.com/articles/ratings-reviews/csp-support-for-v2-applications),
built in `src/lib/csp.ts` and sent as real response headers from `next.config.ts`.

Deviations from Bazaarvoice's published table, all deliberate:

- `'self'` added to `img-src` so our own favicon and logo load.
- `https://www.youtube.com` in `frame-src`, since reviewers can attach a YouTube video.
- `base-uri`, `form-action`, and `frame-ancestors` added — not in Bazaarvoice's table, but worth
  having on a page that handles consumer input.
- When `BV_COOKIE_CONSENT=true`, `cdn.cookielaw.org` is added to `script-src` (as documented) and
  also to `connect-src` along with `geolocation.onetrust.com` — undocumented, but OneTrust's banner
  fetches those and blocks the form without them.

`CSP_EXTRA_SCRIPT_SRC`, `CSP_EXTRA_STYLE_SRC`, `CSP_EXTRA_IMG_SRC`, `CSP_EXTRA_CONNECT_SRC`, and
`CSP_EXTRA_FRAME_SRC` append extra sources for tag managers, analytics, or an externally hosted logo.

`CSP_MODE=report-only` while validating a change; `CSP_MODE=off` if a CDN in front of this app
already sets a CSP — **two CSP headers intersect**, and the intersection will break the form.

### Tightening the CSP

`script-src` includes `'unsafe-inline'`. Next.js emits inline bootstrap scripts and we emit the
inline loader script, and a hash cannot help: once any hash or nonce is present browsers ignore
`'unsafe-inline'`, and Next.js's inline scripts change every build.

The strict alternative is nonce-based CSP via middleware, which Next.js supports. It costs static
rendering — every request becomes a server render, which is a real availability trade given the
above. Worth doing if the security review asks for it; not worth doing pre-emptively.

---

## Development

```bash
npm install
cp .env.example .env.local     # fill in BV_CLIENT_NAME at minimum
npm run dev
```

Then open `http://localhost:3000/reviews/submit?user=<token>&products=<ids>`. Without a real
Bazaarvoice client name and an allowlisted domain, bv.js will not load and the container stays
empty — that is expected locally.

### Checks

```bash
npm run check      # typecheck + lint + build + tests
npm test           # Playwright only
```

The tests stub bv.js — they block `apps.bazaarvoice.com` and call `window.bvCallback` with a fake BV
object, exactly as the real library does. That covers our side of the integration (container,
callback wiring, the `mpsClose` redirect and the *absence* of a redirect on an incomplete close,
query-string preservation, CSP headers, `noindex`) without depending on Bazaarvoice being reachable.

Tests run against a production build, since the inline loader script, CSP headers, and redirects do
not exist in dev mode. If your environment ships a pre-installed Chromium whose build number does
not match `@playwright/test`, set `PLAYWRIGHT_CHROMIUM_PATH` to its binary.

### Diagnostics

Append `?bvDebug=1` to the submit URL for a panel showing the resolved bv.js URL, whether
`window.bvCallback` and `window.BV` exist, whether the container has been populated, and which
parameters arrived. Use it for the staging test step in Bazaarvoice's checklist.

It never prints the `user` token in full — only its length and first few characters — because that
token carries consumer PII.

---

## Deployment checklist

Bazaarvoice's implementation checklist, mapped to this repo:

- [ ] Create staging and production pages on our domain → deploy this app to both
- [ ] Verify bv.js loads → `/reviews/submit?bvDebug=1&…`, check "Bazaarvoice global"
- [ ] Confirm the container div is present → same panel, "Container div: found"
- [ ] Update CSP headers → automatic; verify no CSP violations in the browser console
- [ ] **Enable Multi-Product Submission on Custom Domain** is ON → Bazaarvoice Support
- [ ] Display mode set to **Inline** → Bazaarvoice Support
- [ ] Production and staging host URLs entered → Bazaarvoice portal
- [ ] Test staging with a real Review Request Email link
- [ ] Confirm the `mpsClose` redirect reaches `/thank-you`
- [ ] Point an uptime monitor at `/api/health`

Existing Review Request Email templates do **not** need updating — Bazaarvoice redirects old hosted
links to our domain and preserves the URL parameters.

---

## Reference

- [Host MPS form on custom domains](https://docs.bazaarvoice.com/articles/#!ratings-reviews/host-the-mps-form-on-your-domain)
- [Add the BV loader](https://docs.bazaarvoice.com/articles/ratings-reviews/bv-pixel-implementation-bv-js/a/add-the-bv-loader)
- [CSP support for V2 applications](https://docs.bazaarvoice.com/articles/ratings-reviews/csp-support-for-v2-applications)
- [Multi-product review submission](https://docs.bazaarvoice.com/articles/#!ratings-reviews/multi-product-submission-form)
