import { expect, test } from "@playwright/test";

/**
 * Product Picker (QR-code) entry point.
 *
 * As with the MPS tests, bv.js is blocked so nothing depends on Bazaarvoice
 * being reachable — what is asserted here is the markup contract Bazaarvoice
 * reads: the container element and its data attributes.
 */

const REGISTER = "/register";

async function stubLoader(page: import("@playwright/test").Page) {
  await page.route("https://apps.bazaarvoice.com/**", (route) => route.abort());
}

test.describe("Product Picker page", () => {
  test("renders the picker container with the campaign and category attributes", async ({
    page,
  }) => {
    await stubLoader(page);
    await page.goto(REGISTER);

    const picker = page.locator('[data-bv-show="product_picker"]');
    await expect(picker).toHaveCount(1);
    await expect(picker).toHaveAttribute("data-bv-campaign-id", "bootz_qr_registration");
    await expect(picker).toHaveAttribute("data-bv-category-id", "Shower_Base");
    await expect(picker).toHaveAttribute("data-bv-inline", "true");
    await expect(picker).toHaveAttribute("data-bv-prevent-close", "false");
  });

  test("never sets both category and product family", async ({ page }) => {
    await stubLoader(page);
    await page.goto(REGISTER);

    // Bazaarvoice throws a console error and renders nothing if both are present.
    const attrs = await page.locator('[data-bv-show="product_picker"]').evaluate((node) => ({
      category: node.hasAttribute("data-bv-category-id"),
      family: node.hasAttribute("data-bv-family-product-id"),
    }));

    expect(attrs.category && attrs.family).toBe(false);
    expect(attrs.category || attrs.family).toBe(true);
  });

  test("does not style the picker container", async ({ page }) => {
    await stubLoader(page);
    await page.goto(REGISTER);

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

  test("loads bv.js exactly once, same as the MPS page", async ({ page }) => {
    await stubLoader(page);
    await page.goto(REGISTER);

    const loaders = await page
      .locator("script[data-bv-loader]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));

    expect(loaders).toEqual([
      "https://apps.bazaarvoice.com/deployments/testclient/main_site/staging/en_US/bv.js",
    ]);
  });

  test("stays out of search indexes", async ({ page }) => {
    await stubLoader(page);
    await page.goto(REGISTER);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("/reviews/register redirects to the short QR path", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/reviews/register");
    expect(new URL(page.url()).pathname).toBe(REGISTER);
  });

  test("does not render the MPS container", async ({ page }) => {
    await stubLoader(page);
    await page.goto(REGISTER);
    // The two Bazaarvoice apps must never share a page.
    await expect(page.locator('[data-bv-show="multi_submission"]')).toHaveCount(0);
  });
});

test.describe("Product Picker diagnostics", () => {
  test("is hidden unless ?bvDebug=1 is present", async ({ page }) => {
    await stubLoader(page);
    await page.goto(REGISTER);
    await page.waitForTimeout(300);
    await expect(page.getByLabel("Bazaarvoice integration diagnostics")).toHaveCount(0);
  });

  test("reports the picker attributes and container state", async ({ page }) => {
    await stubLoader(page);
    await page.goto(`${REGISTER}?bvDebug=1`);

    const panel = page.getByLabel("Bazaarvoice integration diagnostics");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("product_picker");
    await expect(panel).toContainText("campaign-id=bootz_qr_registration");
    await expect(panel).toContainText("category-id=Shower_Base");
    // With bv.js blocked the container must report as present but unrendered —
    // this is the state that distinguishes "our markup is wrong" from
    // "Bazaarvoice declined to render".
    await expect(panel).toContainText("Container div");
    await expect(panel).toContainText("found");
    await expect(panel).toContainText("empty — Bazaarvoice has not rendered into it");
  });

  test("does not report MPS-only rows on the picker page", async ({ page }) => {
    await stubLoader(page);
    await page.goto(`${REGISTER}?bvDebug=1`);

    const panel = page.getByLabel("Bazaarvoice integration diagnostics");
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText("Last mpsClose");
  });
});

test.describe("health endpoint", () => {
  test("reports the Product Picker configuration", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      productPicker: {
        campaignId: "bootz_qr_registration",
        categoryId: "Shower_Base",
        familyProductId: null,
        inline: true,
        preventClose: false,
      },
    });
  });
});
