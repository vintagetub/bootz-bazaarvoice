import { expect, test } from "@playwright/test";

/**
 * The real bv.js cannot be loaded from a test environment (it is bound to a
 * live Bazaarvoice client and deployment zone), so these tests block the
 * request to apps.bazaarvoice.com.
 *
 * What is asserted is the markup contract Bazaarvoice reads — the container
 * element and its data attributes — plus the routing and response headers.
 * Whether Bazaarvoice then chooses to render is account-side and not something
 * a test can cover.
 */

/** Both are real pages; a QR code may carry either. */
const PICKER_PATHS = ["/", "/register"];

async function stubLoader(page: import("@playwright/test").Page) {
  await page.route("https://apps.bazaarvoice.com/**", (route) => route.abort());
}

for (const path of PICKER_PATHS) {
  test.describe(`Product Picker at ${path}`, () => {
    test("serves the picker container directly, with no redirect", async ({ page }) => {
      await stubLoader(page);
      const response = await page.goto(path);

      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.locator('[data-bv-show="product_picker"]')).toHaveCount(1);
    });

    test("carries the campaign and category attributes", async ({ page }) => {
      await stubLoader(page);
      await page.goto(path);

      const picker = page.locator('[data-bv-show="product_picker"]');
      await expect(picker).toHaveAttribute("data-bv-campaign-id", "bootz_qr_registration");
      await expect(picker).toHaveAttribute("data-bv-category-id", "Shower_Base");
      await expect(picker).toHaveAttribute("data-bv-inline", "true");
      await expect(picker).toHaveAttribute("data-bv-prevent-close", "false");
    });

    test("never sets both category and product family", async ({ page }) => {
      await stubLoader(page);
      await page.goto(path);

      // Bazaarvoice throws a console error and renders nothing if both are set.
      const attrs = await page.locator('[data-bv-show="product_picker"]').evaluate((node) => ({
        category: node.hasAttribute("data-bv-category-id"),
        family: node.hasAttribute("data-bv-family-product-id"),
      }));

      expect(attrs.category && attrs.family).toBe(false);
      expect(attrs.category || attrs.family).toBe(true);
    });

    test("does not style the picker container", async ({ page }) => {
      await stubLoader(page);
      await page.goto(path);

      // Bazaarvoice owns everything inside the container; the .bv-slot wrapper
      // carries the page layout instead.
      const box = await page.locator('[data-bv-show="product_picker"]').evaluate((node) => {
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

    test("loads bv.js exactly once", async ({ page }) => {
      await stubLoader(page);
      await page.goto(path);

      const loaders = await page
        .locator('script[src*="apps.bazaarvoice.com"]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));

      expect(loaders).toEqual([
        "https://apps.bazaarvoice.com/deployments/testclient/main_site/staging/en_US/bv.js",
      ]);
    });

    test("stays out of search indexes", async ({ page }) => {
      await stubLoader(page);
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    });
  });
}

test.describe("MPS is gone", () => {
  test("no page renders the multi_submission container", async ({ page }) => {
    await stubLoader(page);
    for (const path of PICKER_PATHS) {
      await page.goto(path);
      await expect(page.locator('[data-bv-show="multi_submission"]')).toHaveCount(0);
    }
  });

  test("the old MPS routes are gone", async ({ request }) => {
    for (const path of ["/reviews/submit", "/thank-you"]) {
      const response = await request.get(path);
      expect(response.status(), `${path} should not exist`).toBe(404);
    }
  });
});

test.describe("diagnostics", () => {
  test("is hidden unless ?bvDebug=1 is present", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/");
    await page.waitForTimeout(300);
    await expect(page.getByLabel("Bazaarvoice integration diagnostics")).toHaveCount(0);
  });

  test("distinguishes our markup from Bazaarvoice declining to render", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/?bvDebug=1");

    const panel = page.getByLabel("Bazaarvoice integration diagnostics");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("product_picker");
    await expect(panel).toContainText("campaign-id=bootz_qr_registration");
    await expect(panel).toContainText("category-id=Shower_Base");
    // The state that matters: container present, Bazaarvoice has not rendered.
    await expect(panel).toContainText("found");
    await expect(panel).toContainText("empty — Bazaarvoice has not rendered into it");
  });
});

test.describe("response headers", () => {
  test("sends a CSP that allows Bazaarvoice and blocks framing", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"];

    expect(csp).toContain("script-src");
    expect(csp).toContain("https://*.bazaarvoice.com");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("robots.txt disallows the whole origin", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(await response.text()).toContain("Disallow: /");
  });
});

test.describe("health endpoint", () => {
  test("reports the resolved Bazaarvoice and Product Picker configuration", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      status: "ok",
      bazaarvoice: {
        clientName: "testclient",
        siteId: "main_site",
        environment: "staging",
        locale: "en_US",
      },
      productPicker: {
        campaignId: "bootz_qr_registration",
        categoryId: "Shower_Base",
        familyProductId: null,
        inline: true,
        preventClose: false,
      },
    });
    // MPS reporting should be gone from the payload entirely.
    expect(body).not.toHaveProperty("mps");
  });
});
