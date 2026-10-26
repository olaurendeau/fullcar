import type { Page } from "@playwright/test";
import { seedPerson, seedRide } from "@/db/test-participants";
import { colour, css, expectColour, gap, ratio } from "./colour";
import { contrast } from "./contrast";
import { expect, leaveNoToken, test } from "./fixtures";
import { legButton, organiserPath } from "./organiser";

// VI4.4 opens the organiser area with its token.
leaveNoToken();

// #683, visual-identity v3 (#651): Fullcar's mark left of the home page's h1, and the tinted
// numbers of « Comment ça marche » (VI2.1, VI4.1, VI4.3 to VI4.5, VI5.4, VI5.7).

const PETROL = "rgb(0, 90, 91)";
const LIGHT = "rgb(250, 250, 250)";
const BRAND_SOFT = "rgb(229, 248, 248)";

const mark = (page: Page) => page.locator("[data-brand-mark]");
const title = (page: Page) => page.getByRole("heading", { level: 1 });
const stepNumbers = (page: Page) => page.locator('main ol > li > [aria-hidden="true"]');

/** VI4.1: one mark, 36 × 36, its right edge 10 px (±1) from the h1's left, both tops on the same pixel (±1). */
async function expectMarkBesideTitle(page: Page) {
  await page.goto("/");
  await expect(mark(page)).toHaveCount(1);
  const box = (await mark(page).boundingBox())!;
  const heading = (await title(page).boundingBox())!;
  expect(box.width).toBe(36);
  expect(box.height).toBe(36);
  expect(Math.abs(heading.x - (box.x + box.width) - 10), `gap ${heading.x - (box.x + box.width)} px, not 10 ±1`).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y - heading.y), `mark top ${box.y}, h1 top ${heading.y}`).toBeLessThanOrEqual(1);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("the mark and the steps on /", () => {
  test.use({ locale: "fr-FR" });

  test("VI2.1: the three step numbers are petrol on #e5f8f8", async ({ page }) => {
    await page.goto("/");
    await expect(stepNumbers(page)).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      const number = stepNumbers(page).nth(index);
      await expectColour(number, "background-color", BRAND_SOFT, `step ${index + 1}`);
      await expectColour(number, "color", PETROL, `step ${index + 1}`);
    }
  });

  test("VI5.4: a step number on its tint is 7.31:1", async ({ page }) => {
    await page.goto("/");
    for (let index = 0; index < 3; index++) {
      const number = stepNumbers(page).nth(index);
      const measured = await contrast(number, number);
      expect(measured).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(measured - 7.31), `step ${index + 1}: ${measured.toFixed(2)}:1, not 7.31:1 ±0.05`).toBeLessThanOrEqual(0.05);
    }
  });

  test("VI4.1: at 360 × 780, the 36 px mark sits 10 px left of « Fullcar », tops aligned", async ({ page }) => {
    await expectMarkBesideTitle(page);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("VI4.3: the mark is hidden from screen readers, has no title, is in no link and never takes the focus", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(mark(page)).toHaveAttribute("aria-hidden", "true");
    await expect(mark(page)).toHaveAttribute("focusable", "false");
    await expect(mark(page).locator("title")).toHaveCount(0);
    expect(await mark(page).evaluate((svg) => svg.closest("a, button, [tabindex]") === null)).toBe(true);
    // Outside the h1: its name stays « Fullcar ».
    await expect(title(page).locator("[data-brand-mark]")).toHaveCount(0);
    await expect(title(page)).toHaveAccessibleName("Fullcar");

    // Every Tab stop of the page, until the focus leaves it: none is the mark or inside it.
    const inMark = () => page.evaluate(() => !!document.activeElement?.closest("[data-brand-mark]"));
    const stops: string[] = [];
    for (let tab = 0; tab < 30; tab++) {
      await page.keyboard.press("Tab");
      expect(await inMark()).toBe(false);
      const stop = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? "");
      if (stops.includes(stop)) break;
      stops.push(stop);
    }
    expect(stops.length).toBeGreaterThan(1);
    // Asked directly, it refuses the focus too.
    await mark(page).evaluate((svg) => (svg as SVGElement).focus());
    expect(await inMark()).toBe(false);
  });

  test("VI4.5: the mark's square is petrol, its car #fafafa", async ({ page }) => {
    await page.goto("/");
    await expectColour(mark(page).locator("rect"), "fill", PETROL, "the mark's rect");
    await expectColour(mark(page).locator("path").first(), "fill", LIGHT, "the mark's first path");
  });

  test("VI5.7: the mark's car on its square is 7.70:1", async ({ page }) => {
    await page.goto("/");
    const car = await colour(mark(page).locator("path").first(), "fill");
    const square = await colour(mark(page).locator("rect"), "fill");
    expect(gap(square, PETROL), `the square: ${css(square)}`).toBeLessThanOrEqual(1);
    const measured = ratio(car, square);
    expect(measured).toBeGreaterThanOrEqual(3);
    expect(Math.abs(measured - 7.7), `${measured.toFixed(2)}:1, not 7.70:1 ±0.05`).toBeLessThanOrEqual(0.05);
  });
});

test.describe("the mark on / on a computer, 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("VI4.1: the 36 px mark sits 10 px left of « Fullcar », tops aligned", async ({ page }) => {
    await expectMarkBesideTitle(page);
  });
});

test.describe("the mark on / in English", () => {
  test.use({ locale: "en-GB" });

  test("VI4.3: the h1 is still named « Fullcar », the mark hidden beside it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(mark(page)).toHaveCount(1);
    await expect(mark(page)).toHaveAttribute("aria-hidden", "true");
    await expect(title(page).locator("[data-brand-mark]")).toHaveCount(0);
    await expect(title(page)).toHaveAccessibleName("Fullcar");
  });
});

test.describe("no mark elsewhere", () => {
  test.use({ locale: "fr-FR" });

  test("VI4.4: none on /nouveau", async ({ page }) => {
    await page.goto("/nouveau");
    await expect(title(page)).toHaveText("Créer un événement");
    await expect(mark(page)).toHaveCount(0);
  });

  test("VI4.4: none on /e/{id}, empty or not", async ({ db, page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    await expect(title(page)).toHaveText("Tournoi de Rennes");
    await expect(mark(page)).toHaveCount(0);

    await seedRide(db, seededEvent.id, (await seedPerson(db, seededEvent.id, { firstName: "Marc" })).id);
    await page.reload();
    await expect(page.getByRole("heading", { level: 3, name: "Voiture de Marc" })).toBeVisible();
    await expect(mark(page)).toHaveCount(0);
  });

  test("VI4.4: none on /e/{id}/admin", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(legButton(page, "aller")).toBeVisible();
    await expect(mark(page)).toHaveCount(0);
  });
});
