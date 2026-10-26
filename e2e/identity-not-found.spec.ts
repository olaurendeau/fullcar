import type { Locator, Page } from "@playwright/test";
import { expectColour } from "./colour";
import { contrast } from "./contrast";
import { expect, leaveNoToken, test } from "./fixtures";
import { legButton, organiserPath, unfoldLegs } from "./organiser";

// VI2.4 opens the organiser area with its token.
leaveNoToken();

// #684, visual-identity v3 (#651): Fullcar's mark left of the not-found page's h1, and the
// tinted tiles of that page and of an empty leg (VI2.4, VI2.5, VI4.2, VI4.3, VI5.5, VI5.6).

const PETROL = "rgb(0, 90, 91)";
const BRAND_SOFT = "rgb(229, 248, 248)";

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";
// C6.4: the organiser's link of an unknown event answers the same page.
const NOT_FOUND_PATHS = [`/e/${UNKNOWN_ID}`, `/e/${UNKNOWN_ID}/admin`];

const mark = (page: Page) => page.locator("[data-brand-mark]");
const title = (page: Page) => page.getByRole("heading", { level: 1 });
/** The not-found page's tile: the SearchX icon's parent. */
const notFoundTile = (page: Page) => page.locator("main svg.lucide-search-x").locator("xpath=..");
const NO_CAR_ALLER = "Aucune voiture proposée pour l’aller";
/** The empty state's tile, just above its « Aucune voiture proposée… »: « Proposer une voiture » has a Car icon too. */
const emptyLegTile = (scope: Locator) =>
  scope.getByText(NO_CAR_ALLER, { exact: true }).locator("xpath=preceding-sibling::div[1]").filter({ has: scope.page().locator("svg.lucide-car") });

async function openNotFound(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(404);
  await expect(title(page)).toBeVisible();
}

/** VI4.2: one mark, 28 × 28, its right edge 10 px (±1) from the h1's left, its top 2 px (±1) below the h1's. */
async function expectMarkBesideTitle(page: Page, path: string) {
  await openNotFound(page, path);
  await expect(mark(page)).toHaveCount(1);
  const box = (await mark(page).boundingBox())!;
  const heading = (await title(page).boundingBox())!;
  expect(box.width).toBe(28);
  expect(box.height).toBe(28);
  expect(Math.abs(heading.x - (box.x + box.width) - 10), `gap ${heading.x - (box.x + box.width)} px, not 10 ±1`).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y - heading.y - 2), `mark top ${box.y}, h1 top ${heading.y}: not 2 px below ±1`).toBeLessThanOrEqual(1);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function expectTinted(tile: Locator, what: string) {
  await expectColour(tile, "background-color", BRAND_SOFT, what);
  await expectColour(tile, "color", PETROL, what);
}

async function expectTileContrast(tile: Locator, what: string) {
  const measured = await contrast(tile, tile);
  expect(measured).toBeGreaterThanOrEqual(3);
  expect(Math.abs(measured - 7.31), `${what}: ${measured.toFixed(2)}:1, not 7.31:1 ±0.05`).toBeLessThanOrEqual(0.05);
}

test.describe("the not-found page, at 360 × 780", () => {
  test.use({ locale: "fr-FR" });

  for (const path of NOT_FOUND_PATHS) {
    test(`VI4.2: on ${path}, the 28 px mark sits 10 px left of « Événement introuvable », 2 px lower, no sideways scroll`, async ({
      page,
    }) => {
      await expectMarkBesideTitle(page, path);
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }

  test("VI2.5: the SearchX tile is petrol on #e5f8f8", async ({ page }) => {
    await openNotFound(page, NOT_FOUND_PATHS[0]);
    await expect(notFoundTile(page)).toHaveCount(1);
    await expectTinted(notFoundTile(page), "the not-found tile");
  });

  test("VI5.6: the SearchX icon on its tint is 7.31:1", async ({ page }) => {
    await openNotFound(page, NOT_FOUND_PATHS[0]);
    await expectTileContrast(notFoundTile(page), "the not-found tile");
  });

  test("VI4.3: the mark is hidden from screen readers, has no title, is in no link and never takes the focus", async ({
    page,
  }) => {
    await openNotFound(page, NOT_FOUND_PATHS[0]);
    await expect(mark(page)).toHaveAttribute("aria-hidden", "true");
    await expect(mark(page)).toHaveAttribute("focusable", "false");
    await expect(mark(page).locator("title")).toHaveCount(0);
    expect(await mark(page).evaluate((svg) => svg.closest("a, button, [tabindex]") === null)).toBe(true);
    // Outside the h1: its name stays « Événement introuvable ».
    await expect(title(page).locator("[data-brand-mark]")).toHaveCount(0);
    await expect(title(page)).toHaveAccessibleName("Événement introuvable");

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
});

test.describe("the not-found page on a computer, 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  for (const path of NOT_FOUND_PATHS) {
    test(`VI4.2: on ${path}, the 28 px mark sits 10 px left of « Événement introuvable », 2 px lower`, async ({ page }) => {
      await expectMarkBesideTitle(page, path);
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }
});

test.describe("the not-found page in English", () => {
  test.use({ locale: "en-GB" });

  test("VI4.3: the h1 is still named « Event not found », the mark hidden beside it", async ({ page }) => {
    await openNotFound(page, NOT_FOUND_PATHS[0]);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(mark(page)).toHaveCount(1);
    await expect(mark(page)).toHaveAttribute("aria-hidden", "true");
    await expect(title(page).locator("[data-brand-mark]")).toHaveCount(0);
    await expect(title(page)).toHaveAccessibleName("Event not found");
  });

  test("VI4.2: at 360 px, the longer title still leaves no sideways scroll", async ({ page }) => {
    await expectMarkBesideTitle(page, NOT_FOUND_PATHS[0]);
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("the empty leg's tile", () => {
  test.use({ locale: "fr-FR" });

  test("VI2.4, VI5.5: on the board, the Car tile is petrol on #e5f8f8, 7.31:1", async ({ page, seededEvent }) => {
    await page.goto(`/e/${seededEvent.id}`);
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText(NO_CAR_ALLER, { exact: true })).toBeVisible();
    const tile = emptyLegTile(panel);
    await expect(tile).toHaveCount(1);
    await expectTinted(tile, "the board's empty-leg tile");
    await expectTileContrast(tile, "the board's empty-leg tile");
  });

  test("VI2.4, VI5.5: in the organiser area, the same tile", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await unfoldLegs(page, ["aller"]);
    const section = page
      .getByRole("region", { name: "Espace organisateur" })
      .getByRole("region", { name: "Aller", exact: true });
    await expect(legButton(page, "aller")).toHaveAttribute("aria-expanded", "true");
    await expect(section.getByText(NO_CAR_ALLER, { exact: true })).toBeVisible();
    const tile = emptyLegTile(section);
    await expect(tile).toHaveCount(1);
    await expectTinted(tile, "the organiser's empty-leg tile");
    await expectTileContrast(tile, "the organiser's empty-leg tile");
  });
});
