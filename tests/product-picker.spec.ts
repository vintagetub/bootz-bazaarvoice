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

test.describe("debug route", () => {
  test("category=none omits the attribute so the root category is offered", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/debug/picker?category=none");

    const picker = page.locator('[data-bv-show="product_picker"]');
    await expect(picker).toHaveCount(1);
    // The whole point: no category filter at all.
    await expect(picker).not.toHaveAttribute("data-bv-category-id", /.*/);
    await expect(picker).toHaveAttribute("data-bv-campaign-id", "bootz_qr_registration");
  });

  test("an explicit category is applied", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/debug/picker?category=Some_Other_Cat");
    await expect(page.locator('[data-bv-show="product_picker"]')).toHaveAttribute(
      "data-bv-category-id",
      "Some_Other_Cat",
    );
  });

  test("family wins over category, never both", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/debug/picker?family=BZ-4832&category=Shower_Base");

    const attrs = await page.locator('[data-bv-show="product_picker"]').evaluate((node) => ({
      category: node.hasAttribute("data-bv-category-id"),
      family: node.getAttribute("data-bv-family-product-id"),
    }));
    expect(attrs.category).toBe(false);
    expect(attrs.family).toBe("BZ-4832");
  });

  test("rejects a junk category rather than putting it in the attribute", async ({ page }) => {
    await stubLoader(page);
    await page.goto('/debug/picker?category=%22%3E%3Cscript%3E');

    const picker = page.locator('[data-bv-show="product_picker"]');
    // Falls back to the configured default instead of echoing the input.
    await expect(picker).toHaveAttribute("data-bv-category-id", "Shower_Base");
  });

  test("shows diagnostics without needing the bvDebug flag", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/debug/picker");
    await expect(page.getByLabel("Bazaarvoice integration diagnostics")).toBeVisible();
  });

  test("stays out of search indexes", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/debug/picker");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("debug route: minimal mode and capture", () => {
  test("minimal=1 emits only data-bv-show, matching Bazaarvoice's bare example", async ({
    page,
  }) => {
    await stubLoader(page);
    await page.goto("/debug/picker?minimal=1");

    const attrs = await page.locator('[data-bv-show="product_picker"]').evaluate((node) =>
      Array.from(node.attributes).map((a) => a.name),
    );
    expect(attrs).toEqual(["data-bv-show"]);
  });

  test("records blocked Bazaarvoice network calls", async ({ page }) => {
    // The stub aborts bv.js, which is itself a failed request to bazaarvoice.com.
    await page.route("https://apps.bazaarvoice.com/**", (route) => route.abort());
    await page.goto("/debug/picker");

    const panel = page.getByLabel("Bazaarvoice integration diagnostics");
    await expect(panel).toContainText("Bazaarvoice network calls");
    await expect(panel).toContainText("Console errors and warnings");
  });

  test("the capture hook is installed before bv.js could run", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/debug/picker");

    // Both buffers must exist even when nothing was captured, otherwise the
    // panel cannot distinguish "no errors" from "not listening".
    const installed = await page.evaluate(() => ({
      log: Array.isArray(window.__bvLog),
      net: Array.isArray(window.__bvNet),
    }));
    expect(installed).toEqual({ log: true, net: true });
  });

  test("capture is not installed on the production pages", async ({ page }) => {
    await stubLoader(page);
    for (const path of PICKER_PATHS) {
      await page.goto(path);
      const patched = await page.evaluate(() => window.__bvLog !== undefined);
      expect(patched, `${path} must not monkey-patch console`).toBe(false);
    }
  });
});

test.describe("cross-origin unmasking and CSP capture", () => {
  test("crossorigin=1 sets the attribute on the bv.js tag", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/debug/picker?crossorigin=1");
    await expect(page.locator('script[src*="apps.bazaarvoice.com"]')).toHaveAttribute(
      "crossorigin",
      "anonymous",
    );
  });

  test("the consumer pages never set crossorigin", async ({ page }) => {
    await stubLoader(page);
    for (const path of PICKER_PATHS) {
      await page.goto(path);
      // A CORS fetch would fail outright if Bazaarvoice omits the header, so the
      // consumer pages must not opt into it.
      const attr = await page
        .locator('script[src*="apps.bazaarvoice.com"]')
        .getAttribute("crossorigin");
      expect(attr, `${path} must not set crossorigin`).toBeNull();
    }
  });

  test("every page loads bv.js exactly once after moving it out of the layout", async ({ page }) => {
    await stubLoader(page);
    for (const path of [...PICKER_PATHS, "/debug/picker"]) {
      await page.goto(path);
      await expect(
        page.locator('script[src*="apps.bazaarvoice.com"]'),
        `${path} should have one loader`,
      ).toHaveCount(1);
    }
  });

  test("records a CSP refusal that console wrapping would miss", async ({ page }) => {
    await page.goto("/debug/picker");
    // Provoke a violation: connect-src does not allow this origin.
    await page.evaluate(() => {
      const image = document.createElement("img");
      image.src = "https://example.com/definitely-blocked.png";
      document.body.appendChild(image);
    });
    await page.waitForTimeout(500);

    const captured = await page.evaluate(() => window.__bvLog ?? []);
    expect(captured.some((line) => line.startsWith("csp-blocked"))).toBe(true);
  });

  test("records a failed resource load", async ({ page }) => {
    await stubLoader(page);
    await page.goto("/debug/picker");
    await page.waitForTimeout(500);

    // bv.js was aborted by the stub, which is a resource failure.
    const captured = await page.evaluate(() => window.__bvLog ?? []);
    expect(captured.some((line) => line.includes("resource-failed"))).toBe(true);
  });
});
