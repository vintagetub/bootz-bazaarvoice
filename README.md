# Bootz — Bazaarvoice MPS host

A small Next.js app that hosts Bazaarvoice review-collection forms on our own domain, so consumers
stay on a Bootz URL instead of being redirected to a Bazaarvoice-hosted page.

It serves two separate Bazaarvoice apps off one shared `bv.js` loader:

| Page | Bazaarvoice app | Entry point |
| --- | --- | --- |
| `/reviews/submit` | **Multi-Product Submission (MPS)** | Review Request Email — the link carries `user` and `products` |
| `/register` | **Product Picker** | QR code on the product — the consumer picks their own product |

Built to Bazaarvoice's guides:
[Host MPS form on custom domains](https://docs.bazaarvoice.com/articles/#!ratings-reviews/host-the-mps-form-on-your-domain)
and [Product Picker](https://docs.bazaarvoice.com/articles/#!ratings-reviews/generic_review_submission).

### Why two pages and not one

MPS renders nothing without `user` and `products` in the URL. A QR code printed on a shower base
cannot carry those — there is no order and no known consumer at print time. Product Picker is the
app built for that case: it shows the products in a category and lets the consumer choose.

`campaignId` and `categoryId` belong to Product Picker only; they have no effect on the MPS
container. The two apps must never share a page.

---

## Configuration

The confirmed Bootz account values are compiled in as defaults, so a deployment needs **no
environment variables at all** to work:

| Setting | Value | Override |
| --- | --- | --- |
| Client name | `bootz` | `BV_CLIENT_NAME` |
| Deployment zone | `main_site` | `BV_SITE_ID` |
| Locale | `en_US` | `BV_LOCALE` |
| Environment | auto — see below | `BV_ENVIRONMENT` |
| Picker campaign ID | `bootz_qr_registration` | `BV_PICKER_CAMPAIGN_ID` |
| Picker category ID | `Shower_Base` | `BV_PICKER_CATEGORY_ID` |

Still worth setting: `BRAND_LOGO_URL` and `BRAND_HOME_URL` for the header and footer, and
`BV_COOKIE_CONSENT=true` if the Bazaarvoice OneTrust integration is enabled on our account. See
`.env.example` for the full list.

### The `environment` segment

`BV_ENVIRONMENT` decides whether bv.js is loaded from the `staging` or `production` path, and
Bazaarvoice's own verification step says to confirm it matches the domain you are serving from.

Left unset, a Vercel **Production** deployment resolves to `production` and everything else —
previews, local dev — resolves to `staging`. That is the safe default: a preview deploy cannot write
test reviews into the production pipeline.

**If we do not have a staging deployment zone provisioned**, preview deploys will point at a
`staging` path that does not exist and bv.js will fail to load. In that case set
`BV_ENVIRONMENT=production` on the Preview environment in Vercel — and know that reviews submitted
from a preview are then real.

### Needs a request to Bazaarvoice Support

Things that can only be changed on Bazaarvoice's side:

1. Turn **Enable Multi-Product Submission on Custom Domain** to **ON**.
2. Set **MPS host URL** (production) and **MPS staging host URL** to the deployed `/reviews/submit`
   URLs.
3. Select the **Inline** display mode. (The page markup is identical for Popup and Inline — only
   Bazaarvoice's configuration decides which you get. This app's layout is built for Inline.)
4. Enable **Product Picker**, if it is not already on. It is a Style Editor toggle on V2 display;
   Support can enable it if the option is missing.

Two prerequisites that are easy to miss:

- **Our domains must be on the Bazaarvoice allowlist**, or bv.js refuses to initialise.
- **`Shower_Base` must exist in the product catalog** — see below. Without it the picker renders
  empty, and the failure looks like a code bug.

### Where `Shower_Base` has to be mapped

`data-bv-category-id` matches a category `ExternalId` in the product catalog. That takes two
things, and either one alone fails:

1. The category **declared** in the `<Categories>` block of the feed:

   ```xml
   <Categories>
     <Category>
       <ExternalId>Shower_Base</ExternalId>
       <Name>Shower Bases</Name>
     </Category>
   </Categories>
   ```

2. Each shower base **referencing** it in `<Products>`:

   ```xml
   <Product>
     <ExternalId>BZ-4832</ExternalId>
     <CategoryExternalId>Shower_Base</CategoryExternalId>
   </Product>
   ```

Declared but unreferenced → the picker shows an empty category. Referenced but undeclared → the
feed import errors.

**Check the feed's category style first.** `<CategoryExternalId>` and `<CategoryPath>` are mutually
exclusive per product. A feed using `<CategoryPath>` identifies categories by *name* and contains no
category `ExternalId` values at all, so `data-bv-category-id` has nothing to match however it is
spelled. If that is how the Bootz feed is built, either convert those products to
`<CategoryExternalId>` or target a product family with `BV_PICKER_FAMILY_PRODUCT_ID` instead.

`ExternalId` accepts only alphanumerics, hyphens, and underscores — `Shower_Base` is valid — and IDs
are case-insensitive, so casing is not a likely cause of an empty picker.

**Doing it without a feed change:** Portal → **More → Product Catalog → Categories → Add category**,
deselecting the auto-generated ID so it can be set to `Shower_Base` (it cannot be changed after
saving), then assigning each product via its **Details** section. Note that
[catalog data source priority](https://docs.bazaarvoice.com/articles/#!ratings-reviews/catalog-sources)
decides whether the next feed import overwrites Portal edits — worth confirming before relying on
this for production rather than a one-off test.

**Verifying:** the Portal **Products** list has a *Product category* column;
**Product Catalog → Feed → Validate Product Feed** shows the last 10 imports and their status.

---

## How it works

### The MPS page (`/reviews/submit`)

Three things on one page:

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

### The Product Picker page (`/register`)

Same loader from the shared layout, then a single container element:

```html
<div data-bv-show="product_picker"
     data-bv-campaign-id="bootz_qr_registration"
     data-bv-category-id="Shower_Base"
     data-bv-inline="true"
     data-bv-prevent-close="false"></div>
```

The path is short on purpose — it gets printed on a label, so
`https://<domain>/register` needs to survive being read off a sticker or typed by hand.
`/reviews/register` redirects here.

`data-bv-category-id` and `data-bv-family-product-id` are **mutually exclusive**: Bazaarvoice throws
a console error and renders nothing if both are present. Rather than emit that markup, setting
`BV_PICKER_FAMILY_PRODUCT_ID` wins, the category is dropped, and `/api/health` returns 503 naming
the conflict. A test asserts exactly one of the two attributes is ever on the element.

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
| `/register` | Product Picker page. **This is the URL the QR codes encode.** |
| `/thank-you` | Landing page for the `mpsClose` redirect |
| `/api/health` | Uptime probe. `200` when configured, `503` with a reason when not |
| `/robots.txt` | Disallows everything — these URLs carry consumer tokens |

`/`, `/reviews`, and `/submit` redirect to `/reviews/submit`; `/reviews/register` redirects to
`/register`.

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

Product Picker, additionally:

- [ ] **Product Picker enabled** → Style Editor toggle, or Bazaarvoice Support
- [ ] Confirm the feed uses `<CategoryExternalId>`, not `<CategoryPath>` (see above)
- [ ] `Shower_Base` declared in `<Categories>` **and** referenced by the shower base products
- [ ] `/register` shows the expected shower bases, not an empty picker
- [ ] `bootz_qr_registration` appears against those submissions in Bazaarvoice reporting
- [ ] QR codes point at the production `/register` URL

Existing Review Request Email templates do **not** need updating — Bazaarvoice redirects old hosted
links to our domain and preserves the URL parameters.

---

## Reference

- [Host MPS form on custom domains](https://docs.bazaarvoice.com/articles/#!ratings-reviews/host-the-mps-form-on-your-domain)
- [Add the BV loader](https://docs.bazaarvoice.com/articles/ratings-reviews/bv-pixel-implementation-bv-js/a/add-the-bv-loader)
- [CSP support for V2 applications](https://docs.bazaarvoice.com/articles/ratings-reviews/csp-support-for-v2-applications)
- [Multi-product review submission](https://docs.bazaarvoice.com/articles/#!ratings-reviews/multi-product-submission-form)
- [Product Picker](https://docs.bazaarvoice.com/articles/#!ratings-reviews/generic_review_submission)
- [XML schema and data requirements](https://docs.bazaarvoice.com/articles/#!ratings-reviews/xml-schema-and-data-requirements)
  — the `<Categories>` and `<Products>` element reference
- [Product Catalog in Portal](https://docs.bazaarvoice.com/articles/#!ratings-reviews/product_catalog)
