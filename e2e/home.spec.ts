import { expect, test } from "@playwright/test";

test.describe("home in a browser set to German", () => {
  test.use({ locale: "de-DE" });

  test("falls back to French", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByText("sans compte")).toBeVisible();
  });
});

test.describe("home in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("speaks English", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("no account needed")).toBeVisible();
  });
});

test.describe("home", () => {
  test("sends no referrer", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("loads no web font", async ({ page }) => {
    const fonts: string[] = [];
    page.on("request", (r) => r.resourceType() === "font" && fonts.push(r.url()));
    await page.goto("/", { waitUntil: "networkidle" });
    expect(fonts).toEqual([]);
  });

  test("does not scroll sideways at 360 px", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
