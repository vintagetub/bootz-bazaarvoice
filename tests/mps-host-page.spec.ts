import { expect, test } from "@playwright/test";

/**
 * The real bv.js cannot be loaded from a test environment (it is bound to a
 * live Bazaarvoice client and deployment zone), so these tests stub it: they
 * block the request to apps.bazaarvoice.com and then invoke
 * `window.bvCallback` with a fake BV object, which is exactly what the real
 * library does once it is ready.
 *
 * That covers the part of the integration that is ours — the container element,
 * the callback wiring, and the mpsClose redirect — without depending on
 * Bazaarvoice being reachable.
 */

const SUBMIT = "/reviews/submit";
/** Stand-in for the opaque signed token Bazaarvoice puts in `user`. */
const USER = "abcdef0123456789abcdef0123456789";
const PRODUCTS = "PROD-1,PROD-2,PROD-3";

/** Blocks the real loader so tests never depend on Bazaarvoice's CDN. */
async function stubLoader(page: import("@playwright/test").Page) {
  await page.route("https://apps.bazaarvoice.com/**", (route) => route.abort());
}

/** Invokes `window.bvCallback` the way bv.js does, then emits `mpsClose`. */
async function fireMpsClose(
  page: import("@playwright/test").Page,
  data: { completed?: boolean; productsSubmitted?: number },
) {
  await page.evaluate((payload) => {
    type Handler = (data: typeof payload) => void;
    const handlers: Handler[] = [];
    const fakeBv = {
      swat_submission: {
        on(event: string, handler: Handler) {
          if (event === "mpsClose") handlers.push(handler);
        },
      },
    };
    // This is the call bv.js makes once the library is ready.
    (window.bvCallback as ((bv: typeof fakeBv) => void) | undefined)?.(fakeBv);
    for (const handler of handlers) handler(payload);
  }, data);
}

test.describe("MPS host page", () => {
  test("renders the Bazaarvoice container and defines bvCallback before the loader runs", async ({
    page,
  }) => {
    await stubLoader(page);
    await page.goto(`${SUBMIT}?user=${USER}&products=${PRODUCTS}`);

    // The container Bazaarvoice renders the form into.
    await expect(page.locator('[data-bv-show="multi_submission"]')).toHaveCount(1);

    // The callback must exist for bv.js to invoke. The loader script defines it
    // and only then injects the bv.js tag, so it is ready before any BV code.
    await expect
      .poll(() => page.evaluate(() => typeof window.bvCallback))
      .toBe("function");

    // And the loader tag was injected exactly once, pointing at the resolved URL.
    const loaders = await page.locator("script[data-bv-loader]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("src")),
    );
    expect(loaders).toEqual([
      "https://apps.bazaarvoice.com/deployments/testclient/main_site/staging/en_US/bv.js",
    ]);
  });

  test("does not apply styles, padding, or margins to the container div", async ({ page }) => {
    await stubLoader(page);
    await page.goto(`${SUBMIT}?user=${USER}&products=${PRODUCTS}`);

    // Bazaarvoice's docs forbid styling this element; the .bv-slot wrapper
    // carries the page layout instead. This guards against a future stylesheet
    // change reaching in.
    const box = await page.locator('[data-bv-show="multi_submission"]').evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
        margin: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft],
        classes: node.className,
      };
    });

    expect(box.padding).toEqual(["0px", "0px", "0px", "0px"]);
    expect(box.margin).toEqual(["0px", "0px", "0px", "0px"]);
    expect(box.classes).toBe("");
  });

  test("redirects to the thank-you page when the consumer completed every review", async ({
    page,
  }) => {
    await stubLoader(page);
    await page.goto(`${SUBMIT}?user=${USER}&products=${PRODUCTS}`);
    await expect.poll(() => page.evaluate(() => typeof window.bvCallback)).toBe("function");

    await fireMpsClose(page, { completed: true, productsSubmitted: 3 });

    await page.waitForURL("**/thank-you");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thanks for your review");
  });

  test("stays on the form when the consumer closed it without finishing", async ({ page }) => {
    await stubLoader(page);
    await page.goto(`${SUBMIT}?user=${USER}&products=${PRODUCTS}`);
    await expect.poll(() => page.evaluate(() => typeof window.bvCallback)).toBe("function");

    await fireMpsClose(page, { completed: false, productsSubmitted: 1 });

    // Give a wrong redirect time to happen before asserting it did not.
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe(SUBMIT);
  });

  test("re-broadcasts mpsClose as a local DOM event for analytics", async ({ page }) => {
    await stubLoader(page);
    await page.goto(`${SUBMIT}?user=${USER}&products=${PRODUCTS}`);
    await expect.poll(() => page.evaluate(() => typeof window.bvCallback)).toBe("function");

    await page.evaluate(() => {
      (window as unknown as { __seen?: unknown }).__seen = undefined;
      window.addEventListener("bootz:mpsClose", (event) => {
        (window as unknown as { __seen?: unknown }).__seen = event.detail;
      });
    });

    await fireMpsClose(page, { completed: false, productsSubmitted: 2 });

    const seen = await page.evaluate(() => (window as unknown as { __seen?: unknown }).__seen);
    expect(seen).toMatchObject({ completed: false, productsSubmitted: 2 });
  });
});

test.describe("diagnostics panel", () => {
  test("is hidden unless ?bvDebug=1 is present", async ({ page }) => {
    await stubLoader(page);
    await page.goto(`${SUBMIT}?user=${USER}&products=${PRODUCTS}`);
    await page.waitForTimeout(300);
    await expect(page.getByLabel("Bazaarvoice integration diagnostics")).toHaveCount(0);
  });

  test("reports parameter state without printing the user token", async ({ page }) => {
    await stubLoader(page);
    await page.goto(`${SUBMIT}?bvDebug=1&user=${USER}&products=${PRODUCTS}`);

    const panel = page.getByLabel("Bazaarvoice integration diagnostics");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("3 product id(s)");
    await expect(panel).toContainText(`present (${USER.length} chars`);

    // The signed token must never be rendered in full.
    await expect(panel).not.toContainText(USER);
  });

  test("flags missing required parameters", async ({ page }) => {
    await stubLoader(page);
    await page.goto(`${SUBMIT}?bvDebug=1`);

    const panel = page.getByLabel("Bazaarvoice integration diagnostics");
    await expect(panel).toContainText("user param");
    await expect(panel).toContainText("missing");
  });
});

test.describe("routing", () => {
  /**
   * Both of these are entered in the Bazaarvoice "MPS host URL" field by
   * different people, so both must serve the form without redirecting.
   */
  for (const path of ["/", SUBMIT]) {
    test(`${path} serves the form directly, with no redirect`, async ({ page }) => {
      await stubLoader(page);
      const target = `${path}?user=${USER}&products=${PRODUCTS}`;
      const response = await page.goto(target);

      // A redirect would re-encode the commas in `products`, which can stop
      // bv.js seeing the product list at all.
      expect(response?.status()).toBe(200);
      expect(page.url()).toContain(target);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator('[data-bv-show="multi_submission"]')).toHaveCount(1);
    });

    test(`${path} preserves the products list uncorrupted`, async ({ page }) => {
      await stubLoader(page);
      await page.goto(`${path}?user=${USER}&products=${PRODUCTS}`);

      // Assert on the raw query string, not the parsed value: URLSearchParams
      // would decode %2C back to a comma and hide the corruption.
      const raw = await page.evaluate(() => window.location.search);
      expect(raw).toContain(`products=${PRODUCTS}`);
      expect(raw).not.toContain("%2C");
    });
  }

  for (const alias of ["/reviews", "/submit"]) {
    test(`${alias} redirects to the form`, async ({ page }) => {
      await stubLoader(page);
      await page.goto(`${alias}?user=${USER}`);
      expect(new URL(page.url()).pathname).toBe("/");
    });
  }
});

test.describe("response headers", () => {
  test("sends a CSP that allows Bazaarvoice and blocks framing", async ({ request }) => {
    const response = await request.get(SUBMIT);
    const csp = response.headers()["content-security-policy"];

    expect(csp).toContain("script-src");
    expect(csp).toContain("https://*.bazaarvoice.com");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("keeps the origin out of search indexes", async ({ request, page }) => {
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /");

    await stubLoader(page);
    await page.goto(SUBMIT);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});

test.describe("health endpoint", () => {
  test("reports the resolved Bazaarvoice configuration", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      bazaarvoice: {
        clientName: "testclient",
        siteId: "main_site",
        environment: "staging",
        locale: "en_US",
      },
    });
  });
});
