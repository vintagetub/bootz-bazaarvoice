# Bootz — Bazaarvoice Product Picker

A small Next.js app that hosts the Bazaarvoice **Product Picker** on our own domain. A consumer
scans the QR code on a product, picks their product from the list, and reviews it — all on a Bootz
URL.

Built to Bazaarvoice's
[Product Picker](https://docs.bazaarvoice.com/articles/#!ratings-reviews/generic_review_submission)
guide (site-hosted, `bv.js`).

### Why Product Picker and not Multi-Product Submission

MPS renders nothing without `user` and `products` in the URL. A QR code printed on a shower base
cannot carry those — at print time there is no order and no known consumer. Product Picker is the
app built for that case: it shows the products in a category and lets the consumer choose.

**Product Picker needs none of the MPS settings in the Bazaarvoice portal.** There is no URL field
pointing at this app, no "Enable Multi-Product Submission on Custom Domain", no host URLs, no
display-type setting. It is simply a page on our domain carrying `bv.js` and the container element;
we link to it ourselves. If MPS custom-domain hosting is still switched on in the portal, it is
unrelated to this app and can be turned off.

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
| Campaign ID | `bootz_qr_registration` | `BV_PICKER_CAMPAIGN_ID` |
| Category ID | `Shower_Base` | `BV_PICKER_CATEGORY_ID` |
| Display | inline | `BV_PICKER_INLINE=false` for a lightbox |

Still worth setting: `BRAND_LOGO_URL` and `BRAND_HOME_URL` for the header and footer, and
`BV_COOKIE_CONSENT=true` if the Bazaarvoice OneTrust integration is enabled on our account. See
`.env.example` for the full list.

These are read during `next build` — the loader URL is compiled into the static HTML and the CSP into
the routes manifest. **Changing an env var in Vercel does nothing until you redeploy.**

### The `environment` segment

`BV_ENVIRONMENT` decides whether bv.js is loaded from the `staging` or `production` path.

Left unset, a Vercel **Production** deployment resolves to `production` and everything else —
previews, local dev — resolves to `staging`. That is the safe default: a preview deploy cannot write
test reviews into the production pipeline.

**If we do not have a staging deployment zone provisioned**, preview deploys will request a `staging`
path that does not exist and bv.js will fail to load. Set `BV_ENVIRONMENT=production` on the Preview
environment in Vercel if so — and know that reviews submitted from a preview are then real.

### Account-side prerequisites

Three things live in Bazaarvoice, not in this repo, and each one produces an **empty picker with no
error message**:

1. **Product Picker must be enabled.** It is a Style Editor toggle on V2 display. If the option is
   not there, Bazaarvoice Support has to enable it.
2. **Our domain must be on the Bazaarvoice allowlist**, or bv.js refuses to initialise.
3. **`Shower_Base` must exist in the product catalog** — see below.

### Where `Shower_Base` has to be mapped

`data-bv-category-id` matches a category `ExternalId` in the product catalog. That takes two things,
and either one alone fails:

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

Declared but unreferenced → the picker shows an empty category. Referenced but undeclared → the feed
import errors.

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

Two things on one page.

**The loader** — Bazaarvoice's step 1, verbatim:

```html
<script async src="https://apps.bazaarvoice.com/deployments/bootz/main_site/production/en_US/bv.js"></script>
```

Rendered by each page rather than the root layout, so `/debug/picker` can load bv.js with CORS while
the consumer pages do not. Every page still renders it exactly once, which is what Bazaarvoice's
add-it-once rule requires; React hoists it into `<head>` wherever in the tree it appears.

There is deliberately no `window.bvCallback`. That hook exists to attach listeners to Bazaarvoice
submission events, and Bazaarvoice documents no such event for Product Picker — the only documented
one, `mpsClose`, belongs to MPS. A hook that fires nothing would be dead code implying a feature we
do not have. If a post-submission callback is wanted later, `window.bvCallback` is the integration
point and it must be defined *before* bv.js executes, which means an inline script ahead of the
loader tag rather than an effect in a client component.

**The container:**

```html
<div data-bv-show="product_picker"
     data-bv-campaign-id="bootz_qr_registration"
     data-bv-category-id="Shower_Base"
     data-bv-inline="true"
     data-bv-prevent-close="false"></div>
```

**Do not style this div** — no classes, padding, or margins. Bazaarvoice manages everything inside
it. The `.bv-slot` wrapper carries the page layout instead, and a test asserts the div's computed
padding and margin stay at zero.

`data-bv-category-id` and `data-bv-family-product-id` are **mutually exclusive**: Bazaarvoice throws
a console error and renders nothing if both are present. Rather than emit that markup, setting
`BV_PICKER_FAMILY_PRODUCT_ID` wins, the category is dropped, and `/api/health` returns 503 naming
the conflict. A test asserts exactly one of the two is ever on the element.

### Routes

| Route | Purpose |
| --- | --- |
| `/` | The Product Picker. **This is the URL the QR codes encode.** |
| `/register` | The same page, for a more descriptive link where there is room |
| `/debug/picker` | Operator tool for diagnosing an empty picker — see below |
| `/api/health` | Uptime probe. `200` when configured, `503` with a reason when not |
| `/robots.txt` | Disallows everything — nothing here is useful to a crawler |

Both picker paths are real pages, never redirects. A printed URL cannot be fixed after the fact, and
Next.js re-encodes the query string when it redirects.

---

## Availability

Bazaarvoice does **not** fail over to a hosted page if this app is down; consumers scanning a
physical product just get a broken link, and the label cannot be recalled. Two consequences:

- **Both pages are statically rendered** (`force-static`) and served from Vercel's CDN. There is no
  per-request work at all.
- **Point an uptime monitor at `/api/health`.** It returns `503` when the Bazaarvoice configuration
  is unusable, which catches the failure a plain 200-check misses: a deployment that serves a
  perfectly healthy page which can never render the picker.

---

## Content Security Policy

Defaults follow
[Bazaarvoice's CSP reference for V2 applications](https://docs.bazaarvoice.com/articles/ratings-reviews/csp-support-for-v2-applications),
built in `src/lib/csp.ts` and sent as real response headers from `next.config.ts`.

Deliberate deviations from that reference:

- `'self'` added to `img-src` so our own favicon and logo load.
- `https://www.youtube.com` in `frame-src`, since reviewers can attach a YouTube video.
- `base-uri`, `form-action`, and `frame-ancestors` added — not in Bazaarvoice's table, but worth
  having on a page that handles consumer input.
- When `BV_COOKIE_CONSENT=true`, `cdn.cookielaw.org` is added to `script-src` (as documented) and
  also to `connect-src` along with `geolocation.onetrust.com` — undocumented, but OneTrust's banner
  fetches those and blocks the page without them.

`CSP_EXTRA_SCRIPT_SRC`, `CSP_EXTRA_STYLE_SRC`, `CSP_EXTRA_IMG_SRC`, `CSP_EXTRA_CONNECT_SRC`, and
`CSP_EXTRA_FRAME_SRC` append extra sources for tag managers, analytics, or an externally hosted logo.

`CSP_MODE=report-only` while validating a change; `CSP_MODE=off` if a CDN in front of this app
already sets a CSP — **two CSP headers intersect**, and the intersection will break the picker.

### Tightening the CSP

`script-src` includes `'unsafe-inline'` because Next.js emits inline bootstrap scripts, and a hash
cannot help: once any hash or nonce is present browsers ignore `'unsafe-inline'`, and Next.js's
inline scripts change every build. The strict alternative is nonce-based CSP via middleware, which
costs static rendering — a real trade given the availability note above. Worth doing if the security
review asks for it; not worth doing pre-emptively.

---

## Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/`. Without an allowlisted domain the picker stays empty — that is
expected locally.

### Checks

```bash
npm run check      # typecheck + lint + build + tests
npm test           # Playwright only
```

Tests block `apps.bazaarvoice.com`, so they assert the markup contract Bazaarvoice reads — container
element, data attributes, the mutual-exclusion rule, routing, CSP headers, `noindex` — without
depending on Bazaarvoice being reachable. They run against a production build, since the CSP headers
and static rendering do not exist in dev mode.

If your environment ships a pre-installed Chromium whose build number does not match
`@playwright/test`, set `PLAYWRIGHT_CHROMIUM_PATH` to its binary.

### Diagnostics

Append `?bvDebug=1` for a panel showing the resolved bv.js URL, whether `window.BV` exists, whether
the container has been populated, and the `data-bv-*` attributes actually on the element.

Its job is to separate two states that look identical from a blank page — our markup being wrong,
and Bazaarvoice declining to render into correct markup:

| Panel says | Meaning |
| --- | --- |
| `Container div: NOT FOUND` | Our markup is broken, or the config is invalid. Check `/api/health` |
| `window.BV not set yet` after a few seconds | bv.js did not load or execute. Check the domain allowlist, the console for CSP violations, and that the bv.js URL returns 200 |
| `window.BV is present`, container `found`, content `empty` | **Our side is complete.** Either Product Picker is not enabled for the account, or no products are mapped to `Shower_Base`. Not a code problem — use `/debug/picker` to tell which |

### Diagnosing an empty picker: `/debug/picker`

The production pages bake their category in at build time, so "does it render with a different
scope?" would otherwise be a redeploy to answer. This route renders per request and takes the scope
from the query string:

```
/debug/picker?minimal=1              Bazaarvoice's bare documented example, nothing else
/debug/picker?category=none          root category — every mapped product
/debug/picker?category=Shower_Base   a specific category ExternalId
/debug/picker?family=BZ-4832         a product family instead
/debug/picker?inline=false           lightbox rather than in-page
/debug/picker?crossorigin=1          unmask a bare "Script error." — see below
```

### Unmasking "Script error."

An exception thrown inside a cross-origin script reaches `window.onerror` as a bare
`Script error.` with no message, file, or line. The browser withholds the detail unless the script
was fetched with CORS *and* the server sends `Access-Control-Allow-Origin`.

`?crossorigin=1` loads bv.js with `crossorigin="anonymous"` so the real message comes through.

**`?crossorigin=all` also forces CORS onto the scripts bv.js injects.** This matters: bv.js is a
loader, and an exception thrown inside a child script is masked by *that child's* CORS status, not
the loader's. If `crossorigin=1` leaves `window.BV` set but the error still reads `Script error.`,
the throw came from a child script and `all` is the flag that unmasks it.

Outcomes:

- **The error text appears** — that is Bazaarvoice's own failure, and it is what a support ticket
  needs.
- **The script stops loading** (`window.BV not set`, plus a `resource-failed` entry) — that host does
  not send the header, and the error cannot be unmasked this way.

The consumer pages never set it: a CORS fetch fails outright when the header is absent, which would
break the picker for everyone. A test asserts that.

The page also shows two things devtools would otherwise be needed for, captured from the moment the
page starts parsing:

- **All Bazaarvoice requests (Resource Timing)** — the authoritative list, read from the browser's own
  Resource Timing buffer. It catches every request by any mechanism: script tags, images, beacons,
  `fetch`, `XHR`. If this shows only bv.js itself, the picker is failing before it asks for products.
- **fetch / XHR calls only** — a narrower view, kept because it carries response statuses that
  Resource Timing does not always expose. An empty list here means nothing on its own: bv.js is a
  loader whose job is injecting script tags, and those go through neither. Read the Resource Timing
  list instead.
- **Console errors and warnings**, tagged by source:
  - `error` / `warn` — bv.js's own logging, including the both-attributes error
  - `uncaught` — an exception bv.js threw. A bare `Script error.` is cross-origin masking; see above
  - `resource-failed` — a script, image, or stylesheet that failed to load. Resource errors do not
    bubble, so this needs a capturing listener the ordinary one would miss
  - `csp-blocked` — a Content-Security-Policy refusal. The browser logs these itself rather than
    through `console.error`, so without a `securitypolicyviolation` listener a CSP block looks like
    silence. The entry names the directive and the blocked URI; widen the policy with the matching
    `CSP_EXTRA_*` variable rather than guessing
  - `injected-script` — a script bv.js added to the page. bv.js is a loader, so these are the modules
    that do the real work, and an exception in one of them is what a masked `Script error.` usually is

Work through the scopes in order:

| Result | Conclusion |
| --- | --- |
| `?minimal=1` renders, fuller markup does not | One of our other attributes is at fault. `data-bv-campaign-id` is the candidate — Bazaarvoice's docs suggest campaign IDs may need to exist on the account, so try a known-good one or drop it |
| `?minimal=1` and `?category=none` both empty, **no network calls recorded** | bv.js is not initialising Product Picker at all. Style Editor toggle is per **deployment zone** and per locale — confirm it was saved against `main_site` / `en_US`, not another zone |
| `?category=none` renders, `?category=Shower_Base` empty | Product Picker works. The `Shower_Base` mapping is the problem — see the catalog section above |
| Network calls recorded but everything empty | Read the response of the catalog request. It says directly whether products came back |

If `?category=none` is the configuration you want in production, set
`BV_PICKER_CATEGORY_ID=none` (also accepts `all`, `root`, `*`) and the attribute is omitted on the
real pages too.

`/debug/picker` is unlinked and `noindex`, but it is publicly reachable — it deliberately exposes
nothing that is not already readable in the page source of the production pages.

---

## Deployment checklist

- [ ] Deploy, and confirm `/api/health` returns 200
- [ ] `/?bvDebug=1` shows `window.BV is present` and `Container div: found`
- [ ] **Product Picker enabled** → Style Editor toggle, or Bazaarvoice Support
- [ ] Domain on the Bazaarvoice allowlist
- [ ] Confirm the feed uses `<CategoryExternalId>`, not `<CategoryPath>`
- [ ] `Shower_Base` declared in `<Categories>` **and** referenced by the shower base products
- [ ] `/` shows the expected shower bases, not an empty picker
- [ ] Submit a test review and confirm `bootz_qr_registration` appears against it in reporting
- [ ] QR codes point at the production `/` URL
- [ ] Uptime monitor on `/api/health`

---

## Reference

- [Product Picker](https://docs.bazaarvoice.com/articles/#!ratings-reviews/generic_review_submission)
- [Add the BV loader](https://docs.bazaarvoice.com/articles/ratings-reviews/bv-pixel-implementation-bv-js/a/add-the-bv-loader)
- [CSP support for V2 applications](https://docs.bazaarvoice.com/articles/ratings-reviews/csp-support-for-v2-applications)
- [XML schema and data requirements](https://docs.bazaarvoice.com/articles/#!ratings-reviews/xml-schema-and-data-requirements)
  — the `<Categories>` and `<Products>` element reference
- [Product Catalog in Portal](https://docs.bazaarvoice.com/articles/#!ratings-reviews/product_catalog)
