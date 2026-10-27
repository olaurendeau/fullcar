import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { contrast } from "./contrast";
import { leaveNoToken } from "./fixtures";
import { expect, legButton, organiserPath, seedCrowd, test, unfoldLegs } from "./organiser";

/*
 * #180, epic #154: the organiser area's sections under 1024 px, folded at first (v3.5, O9),
 * and its two columns from 1024 px; the widths of O7.5. Each test runs under the fixture
 * `organiserTraffic` (O6.1, O2.10). No assertion, title or message here shows the token:
 * a URL is compared, and a mismatch is named, never printed.
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  shareLink: "Lien à partager",
  nobody: "Personne ne s’est encore inscrit.",
  noCarRetour: "Aucune voiture proposée pour le retour",
};

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
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

/** A person of the event, without a car on each of `legs`. */
async function withoutCar(db: Kysely<Database>, eventId: string, firstName: string, legs: Leg[]) {
  const { id } = await seedPerson(db, eventId, { firstName });
  for (const leg of legs) await seedPlacement(db, { personId: id, eventId, leg, rideId: null });
}

/**
 * The README's example: at the aller, 2 without a car and 3 free seats; at the retour,
 * 4 without a car and 2 free seats, so 2 seats missing.
 */
async function seedExample(db: Kysely<Database>, eventId: string) {
  const { id } = await seedPerson(db, eventId, { firstName: "Marc" });
  await seedRide(db, eventId, id, { seats: 3 });
  await seedRide(db, eventId, id, { leg: "retour", seats: 2, departureTime: "18:00:00" });
  for (const name of ["Léa", "Tom"]) await withoutCar(db, eventId, name, ["aller", "retour"]);
  for (const name of ["Zoé", "Hugo"]) await withoutCar(db, eventId, name, ["retour"]);
}

test.use({ locale: "fr-FR" });

test.describe("the README's example", () => {
  test.beforeEach(async ({ db, seededEvent }) => {
    await seedExample(db, seededEvent.id);
  });

  test("O1.3: at 360 px, the sections one under the other, Aller first, folded; the summary's pill is the tab's, the seats missing in bold", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(legButton(page, "aller")).toHaveAttribute("aria-expanded", "false");
    await expect(legButton(page, "retour")).toHaveAttribute("aria-expanded", "false");
    const [aller, retour] = await Promise.all([box(section(page, "Aller")), box(section(page, "Retour"))]);
    expect(aller.y + aller.height).toBeLessThanOrEqual(retour.y);
    expect(Math.abs(aller.x - retour.x)).toBeLessThanOrEqual(1);

    const pill = page.getByRole("tab", { name: "Retour 4 sans voiture" }).getByText("4 sans voiture", { exact: true });
    const summaryPill = section(page, "Retour").getByText("4 sans voiture", { exact: true });
    for (const property of ["background-color", "color"]) {
      const tab = await pill.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
      await expect(summaryPill).toHaveCSS(property, tab);
    }
    await expect(section(page, "Retour").getByText("Il manque 2 places", { exact: true })).toHaveCSS("font-weight", "600");
    await expect(page.locator('a[href^="#"]')).toHaveCount(0);
  });

  test("O4.1 (amended by #250, v3.5 and OA7.3): under 1024 px, top to bottom: the title, the link to share, « Modifier l’événement », then the sections", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(heading(page, "Retour")).toBeVisible();
    await expect(panel(page).getByRole("group")).toHaveCount(1);
    await expect(panel(page).getByRole("note")).toHaveCount(0);
    const parts = [
      panel(page).getByRole("heading", { level: 2 }),
      linkGroup(page, FR.shareLink),
      panel(page).getByRole("button", { name: "Modifier l’événement", exact: true }),
      heading(page, "Aller"),
      heading(page, "Retour"),
    ];
    const tops = await Promise.all(parts.map(async (part) => (await box(part)).y));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(tops.length);
  });

  test("O4.2: at 360 × 780, the link to share is visible without scrolling", async ({ page, seededEvent }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(heading(page, "Retour")).toBeVisible();
    await expect(linkGroup(page, FR.shareLink).getByTestId("link")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  // From 1024 px, the very width where the columns start, not only on a wide screen.
  for (const width of [1024, 1280]) {
    test.describe(`at ${width} × 800`, () => {
      test.use({ viewport: { width, height: 800 } });

      test("O1.2, O4.1, OA7.8: the link to share in the left column, the right one empty, one separator, then the sections side by side, Aller on the left and first", async ({
        page,
        seededEvent,
      }) => {
        await page.goto(organiserPath(seededEvent));
        await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(["Aller", "Retour"]);
        const [share, aller, retour] = await Promise.all(
          [linkGroup(page, FR.shareLink), section(page, "Aller"), section(page, "Retour")].map(box),
        );
        // OA7.8: the link keeps its column's width, Aller's, and nothing is beside it, over Retour.
        expect(Math.abs(share.width - aller.width)).toBeLessThanOrEqual(1);
        expect(share.x + share.width).toBeLessThanOrEqual(retour.x);

        // A single line between the link and the sections.
        const separators = panel(page).locator("hr:visible");
        await expect(separators).toHaveCount(1);
        const line = await box(separators);
        expect(line.y).toBeGreaterThanOrEqual(share.y + share.height);
        expect(line.y).toBeLessThanOrEqual(aller.y);

        expect(Math.abs(aller.y - retour.y)).toBeLessThanOrEqual(1);
        expect(aller.x + aller.width).toBeLessThanOrEqual(retour.x);
        expect(Math.abs(aller.x - share.x)).toBeLessThanOrEqual(1);
        expect(aller.y).toBeGreaterThan(share.y + share.height);
        await expect(section(page, "Aller")).toHaveCSS("border-top-width", "0px");
        expect(await horizontalOverflow(page)).toBe(0);
      });
    });
  }
});

test("O1.3, O1.5: everyone seated, and an empty leg beside: folded, its name then « Personne… » without a pill, at 4.5:1 at least", async ({
  db,
  page,
  seededEvent,
}) => {
  const { id } = await seedPerson(db, seededEvent.id, { firstName: "Marc" });
  const ride = await seedRide(db, seededEvent.id, id, { seats: 1 });
  const lea = await seedPerson(db, seededEvent.id, { firstName: "Léa" });
  await seedPlacement(db, { personId: lea.id, eventId: seededEvent.id, leg: "aller", rideId: ride });

  await page.goto(organiserPath(seededEvent));
  await expect(legButton(page, "aller")).toHaveAccessibleDescription("Tout le monde a une place");
  await expect(legButton(page, "retour")).toHaveAccessibleName("Retour");
  await expect(legButton(page, "retour")).toHaveAccessibleDescription(FR.nobody);
  const retour = section(page, "Retour");
  await expect(retour.getByText(/sans voiture/)).toHaveCount(0);
  const nobody = retour.getByText(FR.nobody, { exact: true }).filter({ visible: true });
  await expect(nobody).toBeVisible();
  // The section has no background of its own: the page's shows through.
  expect(await contrast(nobody, page.locator("body"))).toBeGreaterThanOrEqual(4.5);
  // Unfolded, the board's empty state.
  await unfoldLegs(page, ["retour"]);
  await expect(retour.getByText(FR.noCarRetour, { exact: true })).toBeVisible();
});

test("O1.5: an event with neither car nor person: both sections folded, « Personne… » in each", async ({ page, seededEvent }) => {
  await page.goto(organiserPath(seededEvent));
  for (const leg of ["Aller", "Retour"] as const) {
    await expect(heading(page, leg).getByRole("button")).toHaveAttribute("aria-expanded", "false");
    await expect(section(page, leg).getByText(FR.nobody, { exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(section(page, leg).getByText(/sans voiture/)).toHaveCount(0);
  }
});

test.describe("without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  test("O1.7: a single section, and « Retour » nowhere in the panel; at 1024 and 1280 px, the section in the left column", async ({
    db,
    page,
    seededEvent,
  }) => {
    await withoutCar(db, seededEvent.id, "Tom", ["aller"]);
    await page.goto(organiserPath(seededEvent));
    await expect(legButton(page, "aller")).toBeVisible();
    await expect(panel(page).getByRole("region")).toHaveCount(1);
    await expect(panel(page).getByText(/Retour/)).toHaveCount(0);

    for (const width of [1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const [aller, left] = await Promise.all([section(page, "Aller"), linkGroup(page, FR.shareLink)].map(box));
      expect(Math.abs(aller.x - left.x), `at ${width} px, the section's left edge`).toBeLessThanOrEqual(1);
      expect(Math.abs(aller.x + aller.width - (left.x + left.width)), `at ${width} px, the section's right edge`).toBeLessThanOrEqual(1);
      await expect(panel(page).getByRole("region")).toHaveCount(1);
    }
  });
});

test("O4.2: at 360 × 780, on an empty event, the link to share is visible without scrolling", async ({
  page,
  seededEvent,
}) => {
  await page.goto(organiserPath(seededEvent));
  await expect(panel(page)).toBeVisible();
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
      await unfoldLegs(page);
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
    await seedExample(db, seededEvent.id);
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
