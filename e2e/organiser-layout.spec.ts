import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { leaveNoToken } from "./fixtures";
import { expect, organiserPath, seedCrowd, test, watchHash } from "./organiser";

/*
 * #180, epic #154: the organiser area's tiles, one per leg, under 1024 px, and its two
 * columns from 1024 px; the widths of O7.5. Each test runs under the fixture
 * `organiserTraffic` (O6.1, O2.10). No assertion, title or message here shows the token:
 * a URL is compared, and a mismatch is named, never printed.
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  shareLink: "Lien à partager",
  adminLink: "Lien d’organisateur",
  nobody: "Personne ne s’est encore inscrit.",
};

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
/** The tiles: the panel's buttons named after a leg. */
const tiles = (page: Page) => panel(page).getByRole("button", { name: /^(Aller|Retour)\b/ });
const tile = (page: Page, leg: "Aller" | "Retour") => panel(page).getByRole("button", { name: new RegExp(`^${leg}\\b`) });
const section = (page: Page, leg: "Aller" | "Retour") => panel(page).getByRole("region", { name: leg, exact: true });
const heading = (page: Page, leg: "Aller" | "Retour") => section(page, leg).getByRole("heading", { level: 3 });
const linkGroup = (page: Page, name: string) => panel(page).getByRole("group", { name });
const list = (scope: Locator, title: string) => scope.getByRole("list", { name: title, exact: true });

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("no box");
  return found;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The contrast ratio of `text`'s colour on `background`'s, as WCAG computes it: a canvas reads any CSS colour. */
async function contrast(text: Locator, background: Locator): Promise<number> {
  const fg = await text.evaluate((element) => getComputedStyle(element).color);
  const bg = await background.evaluate((element) => getComputedStyle(element).backgroundColor);
  return text.page().evaluate(
    ([fg, bg]) => {
      const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const luminance = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((value) => {
          const c = value / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    },
    [fg, bg],
  );
}

/** A person of the event, without a car on each of `legs`. */
async function withoutCar(db: Kysely<Database>, eventId: string, firstName: string, legs: Leg[]) {
  const { id } = await seedPerson(db, eventId, { firstName });
  for (const leg of legs) await seedPlacement(db, { personId: id, eventId, leg, rideId: null });
}

/**
 * The tiles of the README: at the aller, 2 without a car and 3 free seats; at the retour,
 * 4 without a car and 2 free seats, so 2 seats missing.
 */
async function seedTiles(db: Kysely<Database>, eventId: string) {
  const { id } = await seedPerson(db, eventId, { firstName: "Marc" });
  await seedRide(db, eventId, id, { seats: 3 });
  await seedRide(db, eventId, id, { leg: "retour", seats: 2, departureTime: "18:00:00" });
  for (const name of ["Léa", "Tom"]) await withoutCar(db, eventId, name, ["aller", "retour"]);
  for (const name of ["Zoé", "Hugo"]) await withoutCar(db, eventId, name, ["retour"]);
}

test.use({ locale: "fr-FR" });

test.describe("the tiles", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedTiles(db, seededEvent.id);
  });

  test("O1.3, O1.4: at 360 px, two tiles side by side, white and bordered, a pill when N > 0, the seats; buttons of 44 px with no icon", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(tiles(page)).toHaveCount(2);
    const aller = panel(page).getByRole("button", { name: "Aller 2 sans voiture 3 places libres", exact: true });
    const retour = panel(page).getByRole("button", { name: "Retour 4 sans voiture Il manque 2 places", exact: true });
    await expect(aller).toBeVisible();
    await expect(retour).toBeVisible();
    // Name, pill and seats, and nothing between them: the folded summary of #204 reads the same.
    expect(await retour.evaluate((element) => element.textContent)).toBe("Retour4 sans voitureIl manque 2 places");

    const [allerBox, retourBox] = await Promise.all([box(aller), box(retour)]);
    expect(Math.abs(allerBox.y - retourBox.y)).toBeLessThanOrEqual(1);
    expect(allerBox.x).toBeLessThan(retourBox.x);

    const white = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const pill = page.getByRole("tab", { name: "Retour 4 sans voiture" }).getByText("4 sans voiture", { exact: true });
    const pillBackground = await pill.evaluate((element) => getComputedStyle(element).backgroundColor);
    for (const each of [aller, retour]) {
      expect((await box(each)).height).toBeGreaterThanOrEqual(44);
      await expect(each).toHaveAttribute("type", "button");
      await expect(each.locator("svg")).toHaveCount(0);
      // White, bordered: never the amber of the pill nor of a banner.
      await expect(each).toHaveCSS("background-color", white);
      expect(white).not.toBe(pillBackground);
      await expect(each).toHaveCSS("border-top-style", "solid");
      await expect(each).toHaveCSS("border-top-width", "1px");
    }
    // The tab's amber pill, the same colours.
    const tilePill = retour.getByText("4 sans voiture", { exact: true });
    for (const property of ["background-color", "color"]) {
      const tab = await pill.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
      await expect(tilePill).toHaveCSS(property, tab);
    }
    await expect(retour.getByText("Il manque 2 places", { exact: true })).toHaveCSS("font-weight", "600");
    await expect(page.locator('a[href^="#"]')).toHaveCount(0);
  });

  test("O1.4, O6.3: a tap or Enter on a tile scrolls to its section and focuses its h3; the URL stays, no hashchange", async ({
    page,
    seededEvent,
    baseURL,
  }) => {
    const hashChanges = await watchHash(page);
    const arrival = new URL(organiserPath(seededEvent), baseURL).href;
    await page.goto(organiserPath(seededEvent));
    await expect(tiles(page)).toHaveCount(2);
    await expect(heading(page, "Retour")).not.toBeInViewport();

    // By touch.
    await tile(page, "Retour").tap();
    await expect(heading(page, "Retour")).toBeFocused();
    await expect(heading(page, "Retour")).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    // By keyboard, from the top again.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(heading(page, "Retour")).not.toBeInViewport();
    await tile(page, "Retour").focus();
    await page.keyboard.press("Enter");
    await expect(heading(page, "Retour")).toBeFocused();
    await expect(heading(page, "Retour")).toBeInViewport();

    await page.evaluate(() => window.scrollTo(0, 0));
    await tile(page, "Aller").focus();
    await page.keyboard.press("Space");
    await expect(heading(page, "Aller")).toBeFocused();
    await expect(heading(page, "Aller")).toBeInViewport();

    expect(page.url() === arrival, "the URL is still the one arrived at, fragment included").toBe(true);
    expect(await hashChanges()).toBe(0);
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('a[href^="#"]')).toHaveCount(0);
  });

  test("O1.3: no tile from 1024 px", async ({ page, seededEvent }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await page.goto(organiserPath(seededEvent));
    await expect(tiles(page)).toHaveCount(2);
    for (const each of await tiles(page).all()) await expect(each).toBeVisible();

    // Hidden, the tiles leave the accessibility tree: none is found by its role any more.
    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(tiles(page)).toHaveCount(0);
      await expect(panel(page).locator("button").filter({ hasText: /^Aller/ })).toBeHidden();
    }
  });

  test("O4.1 (amended by #250): under 1024 px, top to bottom: the title, the tiles, both links, the warning, « Modifier l’événement », then the sections", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(tiles(page)).toHaveCount(2);
    const parts = [
      panel(page).getByRole("heading", { level: 2 }),
      tile(page, "Aller"),
      linkGroup(page, FR.shareLink),
      linkGroup(page, FR.adminLink),
      panel(page).getByRole("note"),
      panel(page).getByRole("button", { name: "Modifier l’événement", exact: true }),
      heading(page, "Aller"),
      heading(page, "Retour"),
    ];
    const tops = await Promise.all(parts.map(async (part) => (await box(part)).y));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(tops.length);
  });

  test("O4.2: at 360 × 780, with tiles, both links and the warning are visible without scrolling", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(tiles(page)).toHaveCount(2);
    await expect(linkGroup(page, FR.shareLink).getByTestId("link")).toBeInViewport({ ratio: 1 });
    await expect(linkGroup(page, FR.adminLink).getByTestId("link")).toBeInViewport({ ratio: 1 });
    await expect(panel(page).getByRole("note")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  // From 1024 px, the very width where the tiles go (O1.3), not only on a wide screen.
  for (const width of [1024, 1280]) {
    test.describe(`at ${width} × 800`, () => {
      test.use({ viewport: { width, height: 800 } });

      test("O1.2, O4.1: both links in two columns, one separator, then the sections side by side, Aller on the left and first", async ({
        page,
        seededEvent,
      }) => {
        await page.goto(organiserPath(seededEvent));
        await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(["Aller", "Retour"]);
        await expect(tiles(page)).toHaveCount(0);
        const [share, admin, warning, aller, retour] = await Promise.all(
          [
            linkGroup(page, FR.shareLink),
            linkGroup(page, FR.adminLink),
            panel(page).getByRole("note"),
            section(page, "Aller"),
            section(page, "Retour"),
          ].map(box),
        );
        expect(Math.abs(share.y - admin.y)).toBeLessThanOrEqual(1);
        expect(share.x + share.width).toBeLessThanOrEqual(admin.x);
        expect(Math.abs(warning.x - admin.x)).toBeLessThanOrEqual(1);
        expect(warning.y).toBeGreaterThan(admin.y);

        // A single line between the links and the sections: the one between the links is gone.
        const separators = panel(page).locator("hr:visible");
        await expect(separators).toHaveCount(1);
        const line = await box(separators);
        expect(line.y).toBeGreaterThanOrEqual(Math.max(share.y + share.height, warning.y + warning.height));
        expect(line.y).toBeLessThanOrEqual(aller.y);

        expect(Math.abs(aller.y - retour.y)).toBeLessThanOrEqual(1);
        expect(aller.x + aller.width).toBeLessThanOrEqual(retour.x);
        expect(Math.abs(aller.x - share.x)).toBeLessThanOrEqual(1);
        expect(aller.y).toBeGreaterThan(Math.max(share.y + share.height, warning.y + warning.height));
        await expect(section(page, "Aller")).toHaveCSS("border-top-width", "0px");
        expect(await horizontalOverflow(page)).toBe(0);
      });
    });
  }
});

test("O1.3, O1.5: everyone seated, and an empty leg beside: its name and « Personne… » without a pill, at 4.5:1 at least", async ({
  db,
  page,
  seededEvent,
}) => {
  const { id } = await seedPerson(db, seededEvent.id, { firstName: "Marc" });
  const ride = await seedRide(db, seededEvent.id, id, { seats: 1 });
  const lea = await seedPerson(db, seededEvent.id, { firstName: "Léa" });
  await seedPlacement(db, { personId: lea.id, eventId: seededEvent.id, leg: "aller", rideId: ride });

  await page.goto(organiserPath(seededEvent));
  await expect(panel(page).getByRole("button", { name: "Aller Tout le monde a une place", exact: true })).toBeVisible();
  const retour = panel(page).getByRole("button", { name: `Retour ${FR.nobody}`, exact: true });
  await expect(retour).toBeVisible();
  await expect(retour.getByText(/sans voiture/)).toHaveCount(0);
  const nobody = retour.getByText(FR.nobody, { exact: true });
  expect(await contrast(nobody, retour)).toBeGreaterThanOrEqual(4.5);
});

test("O1.3: no tile on an event with neither car nor person", async ({ page, seededEvent }) => {
  await page.goto(organiserPath(seededEvent));
  await expect(heading(page, "Retour")).toBeVisible();
  await expect(tiles(page)).toHaveCount(0);
});

test.describe("without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  test("O1.7: a single tile, the panel's whole width; at 1024 and 1280 px, the section in the left column", async ({
    db,
    page,
    seededEvent,
  }) => {
    await withoutCar(db, seededEvent.id, "Tom", ["aller"]);
    await page.goto(organiserPath(seededEvent));
    await expect(tiles(page)).toHaveCount(1);
    const [only, share] = await Promise.all([box(tile(page, "Aller")), box(linkGroup(page, FR.shareLink))]);
    expect(Math.abs(only.x - share.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(only.width - share.width)).toBeLessThanOrEqual(1);

    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const [aller, left, right] = await Promise.all(
        [section(page, "Aller"), linkGroup(page, FR.shareLink), linkGroup(page, FR.adminLink)].map(box),
      );
      expect(Math.abs(aller.x - left.x), `at ${width} px, the section's left edge`).toBeLessThanOrEqual(1);
      expect(aller.x + aller.width, `at ${width} px, the section's right edge`).toBeLessThanOrEqual(right.x);
      await expect(panel(page).getByRole("region")).toHaveCount(1);
    }
  });
});

test("O4.2: at 360 × 780, on an empty event, both links and the warning are visible without scrolling", async ({
  page,
  seededEvent,
}) => {
  await page.goto(organiserPath(seededEvent));
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("note")).toBeInViewport({ ratio: 1 });
  await expect(linkGroup(page, FR.shareLink).getByTestId("link")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test.describe("a crowd", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedCrowd(db, seededEvent.id);
  });

  for (const viewport of [
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`O5.9: at ${viewport.width} px, 15 cars and 60 persons: no overflow, five lines a list, and the event after the panel`, async ({
      page,
      seededEvent,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(organiserPath(seededEvent));
      for (const [leg, title, more] of [
        ["Aller", "Sans voiture (14)", "Afficher les 9 autres"],
        ["Aller", "Voitures sans numéro (7)", "Afficher les 2 autres"],
        ["Retour", "Sans voiture (20)", "Afficher les 15 autres"],
        ["Retour", "Voitures sans numéro (7)", "Afficher les 2 autres"],
      ] as const) {
        await expect(list(section(page, leg), title).getByRole("listitem")).toHaveCount(5);
        await expect(section(page, leg).getByRole("button", { name: more, exact: true })).toBeVisible();
      }
      expect(await horizontalOverflow(page)).toBe(0);
      const [own, title] = await Promise.all([box(panel(page)), box(page.getByRole("heading", { level: 1 }))]);
      expect(title.y).toBeGreaterThanOrEqual(own.y + own.height);
    });
  }
});

/** The width and the left edge of `locator`, and whether it is centred in the page. */
async function placeOf(locator: Locator) {
  const { x, width } = await box(locator);
  const page = await locator.page().evaluate(() => document.documentElement.clientWidth);
  return { x, width, centred: Math.abs(x + width / 2 - page / 2) <= 1 };
}

test.describe("O7.5", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedTiles(db, seededEvent.id);
  });

  test("at 1280 px, the panel is at most 1024 px wide, centred; the header and the board have the width of /e/{id}", async ({
    page,
    seededEvent,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/e/${seededEvent.id}`);
    const header = page.getByRole("main").locator("header");
    const board = page.getByRole("tablist");
    const [publicHeader, publicBoard] = await Promise.all([placeOf(header), placeOf(board)]);

    await page.goto(organiserPath(seededEvent));
    await expect(panel(page)).toBeVisible();
    const own = await placeOf(panel(page));
    expect(own.width).toBeLessThanOrEqual(1024);
    expect(own.width).toBeGreaterThan(publicBoard.width);
    expect(own.centred, "the panel is centred").toBe(true);
    for (const [what, locator, there] of [
      ["header", header, publicHeader],
      ["board", board, publicBoard],
    ] as const) {
      const here = await placeOf(locator);
      expect(Math.abs(here.width - there.width), `the ${what}'s width`).toBeLessThanOrEqual(1);
      expect(here.centred, `the ${what} is centred`).toBe(true);
    }
  });

  for (const width of [360, 1000]) {
    test(`at ${width} px, the panel and the board have the same width`, async ({ page, seededEvent }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(organiserPath(seededEvent));
      const [own, board] = await Promise.all([placeOf(panel(page)), placeOf(page.getByRole("tablist"))]);
      expect(Math.abs(own.width - board.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(own.x - board.x)).toBeLessThanOrEqual(1);
    });
  }
});
