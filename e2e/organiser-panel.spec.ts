import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { leaveNoToken } from "./fixtures";
import { digitsOf, expect, organiserPath, type ScenePhones, seedOrganiserScene, test } from "./organiser";

/*
 * #179, epic #154: the organiser area's sections, one per leg, under the warning. Each test
 * runs under the fixture `organiserTraffic` (O6.1, O2.10). No assertion, title or message
 * here shows a number: a number is compared, and a mismatch is named, never printed.
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  withoutCarHint: "Ces numéros vous sont montrés pour organiser les voitures : ne les diffusez pas.",
  withoutCarEmpty: "Personne n’est sans voiture.",
  noPhone: "Pas de numéro",
  carsHint:
    "Les personnes à bord ne peuvent pas appeler la personne qui conduit. Demandez-lui d’ajouter son numéro.",
  carsEmpty: "Toutes les voitures ont un numéro.",
  noCarRetour: "Aucune voiture proposée pour le retour",
  less: "Réduire la liste",
};

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const section = (page: Page, name: "Aller" | "Retour") => panel(page).getByRole("region", { name, exact: true });
const list = (scope: Locator, title: string) => scope.getByRole("list", { name: title, exact: true });
const rows = (scope: Locator) => scope.getByRole("listitem");
const tel = 'a[href^="tel:"]';

/** `actual` is `expected`, named by `what`: neither is printed. */
function same(actual: string | null, expected: string, what: string) {
  expect(actual === expected, what).toBe(true);
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("no box");
  return found;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** A person of the event, without a car on each of `legs`. */
async function withoutCar(db: Kysely<Database>, eventId: string, firstName: string, phone: string | null, legs: Leg[]) {
  const { id } = await seedPerson(db, eventId, { firstName, phone });
  for (const leg of legs) await seedPlacement(db, { personId: id, eventId, leg, rideId: null });
  return id;
}

test.use({ locale: "fr-FR" });

test.describe("the scene of O2.5", () => {
  let phones: ScenePhones;

  test.beforeEach(async ({ db, seededEvent }) => {
    phones = await seedOrganiserScene(db, seededEvent.id);
  });

  test("O1.1: a section per leg, its date and time, and the board's banner, the same words and colour, not live", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(["Aller", "Retour"]);

    for (const [leg, time, banner] of [
      ["Aller", /^samedi 12 décembre 2026 à 07:30$/, "2 sans voiture · il manque 1 place"],
      ["Retour", /^samedi 12 décembre 2026 à 18:00$/, "1 sans voiture · il manque 1 place"],
    ] as const) {
      const own = section(page, leg);
      await expect(own.locator("time").first()).toHaveText(time);
      await page.getByRole("tab", { name: new RegExp(`^${leg}`) }).click();
      const boards = page.getByRole("tabpanel").getByRole("status");
      await expect(boards).toHaveText(banner);
      const ours = own.getByText(banner, { exact: true }).locator("..");
      await expect(ours).toHaveCount(1);
      for (const property of ["background-color", "color"]) {
        const board = await boards.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
        await expect(ours).toHaveCSS(property, board);
      }
      await expect(own.getByRole("status")).toHaveCount(0);
    }
  });

  test("O1.6: no car on the leg: the banner, « Aucune voiture… », its list, and no « Voitures sans numéro »", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    const retour = section(page, "Retour");
    const banner = retour.getByText("1 sans voiture · il manque 1 place", { exact: true });
    const noCar = retour.getByText(FR.noCarRetour, { exact: true });
    const title = retour.getByRole("heading", { level: 4, name: "Sans voiture (1)" });
    const tops = await Promise.all([banner, noCar, title].map(async (each) => (await box(each)).y));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    await expect(retour.getByRole("heading", { level: 4 })).toHaveCount(1);
    await expect(retour).not.toContainText("Voitures sans numéro");
  });

  test("O2.2, O2.5, O7.4: « Sans voiture (2) » at the aller, C with her number, D without, the warning under the title", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    const aller = section(page, "Aller");
    const title = aller.getByRole("heading", { level: 4, name: "Sans voiture (2)", exact: true });
    const persons = list(aller, "Sans voiture (2)");
    await expect(rows(persons)).toHaveCount(2);
    await expect(rows(persons).first()).toContainText("Chloé");
    await expect(rows(persons).nth(1)).toContainText("Dylan");

    const link = rows(persons).first().locator(tel);
    await expect(link).toHaveCount(1);
    same(await link.innerText(), phones.c, "C's link shows her number as typed");
    same(await link.getAttribute("aria-label"), `Appeler Chloé au ${phones.c}`, "C's link's name");
    const linkBox = await box(link);
    expect(linkBox.height).toBeGreaterThanOrEqual(44);
    expect(linkBox.height).toBeLessThan(48);
    await expect(link).toHaveCSS("white-space", "nowrap");

    await expect(rows(persons).nth(1).locator(tel)).toHaveCount(0);
    await expect(rows(persons).nth(1).getByText(FR.noPhone, { exact: true })).toBeVisible();

    const hint = aller.getByText(FR.withoutCarHint, { exact: true });
    const [titleTop, hintTop, firstRow] = await Promise.all([title, hint, rows(persons).first()].map(box));
    expect(titleTop.y).toBeLessThan(hintTop.y);
    expect(hintTop.y).toBeLessThan(firstRow.y);

    // O2.5, the retour: B with his number.
    const retour = list(section(page, "Retour"), "Sans voiture (1)");
    await expect(rows(retour)).toHaveCount(1);
    await expect(rows(retour)).toContainText("Bastien");
    same(await rows(retour).locator(tel).innerText(), phones.b, "B's link shows his number");
  });

  test("O2.8: under the panel, the board has no tel: link, and its « Sans voiture » carries no number", async ({
    page,
    seededEvent,
  }) => {
    await page.goto(organiserPath(seededEvent));
    await expect(panel(page).locator(tel)).toHaveCount(2);
    await expect(page.locator(tel)).toHaveCount(2);

    for (const leg of ["Aller", "Retour"]) {
      await page.getByRole("tab", { name: new RegExp(`^${leg}`) }).click();
      const board = page.getByRole("tabpanel").getByRole("region", { name: "Sans voiture", exact: true });
      await expect(board).toBeVisible();
      const text = await board.innerText();
      const shown = Object.values(phones).flatMap(digitsOf).filter((form) => text.includes(form));
      expect(shown.length, `numbers in the board's « Sans voiture » at the ${leg}`).toBe(0);
    }
  });
});

test("O2.3: a person without a car on both legs is in both sections, with her number in each", async ({
  db,
  page,
  seededEvent,
}) => {
  const phone = "06 44 21 87 30";
  await withoutCar(db, seededEvent.id, "Tom", phone, ["aller", "retour"]);
  await page.goto(organiserPath(seededEvent));
  for (const leg of ["Aller", "Retour"] as const) {
    const persons = list(section(page, leg), "Sans voiture (1)");
    await expect(rows(persons)).toContainText("Tom");
    same(await rows(persons).locator(tel).innerText(), phone, `Tom's number at the ${leg}`);
  }
});

test("O1.5: an empty leg shows the board's empty state, without banner or list", async ({ page, seededEvent }) => {
  await page.goto(organiserPath(seededEvent));
  for (const [leg, noCar] of [
    ["Aller", "Aucune voiture proposée pour l’aller"],
    ["Retour", FR.noCarRetour],
  ] as const) {
    const own = section(page, leg);
    await expect(own.getByText(noCar, { exact: true })).toBeVisible();
    await expect(own.getByText("Personne ne s’est encore inscrit.", { exact: true })).toBeVisible();
    await expect(own.getByRole("heading", { level: 4 })).toHaveCount(0);
    await expect(own.getByRole("list")).toHaveCount(0);
    await expect(own).not.toContainText("sans voiture");
    await expect(own).not.toContainText("Tout le monde a une place");
  }
});

test.describe("without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  test("O1.7: a single section, and no « Retour » anywhere in the panel", async ({ db, page, seededEvent }) => {
    await withoutCar(db, seededEvent.id, "Tom", null, ["aller"]);
    await page.goto(organiserPath(seededEvent));
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(["Aller"]);
    await expect(section(page, "Aller")).toContainText("Sans voiture (1)");
    await expect(panel(page)).not.toContainText("Retour");
  });
});

test("O3.1, O3.2, O3.3, O2.4: the cars whose driver has no number, by departure time, with no action; empty lists say so", async ({
  db,
  page,
  seededEvent,
}) => {
  const eventId = seededEvent.id;
  const driver = async (firstName: string, phone: string | null) => (await seedPerson(db, eventId, { firstName, phone })).id;
  const yann = await driver("Yann", null);
  const karim = await driver("Karim", null);
  const sophie = await driver("Sophie", "06 71 20 45 98");
  const leo = await driver("Léo", null);
  await seedRide(db, eventId, yann, { departureTime: "07:30:00", location: "Église, Châteaugiron", seats: 3 });
  const full = await seedRide(db, eventId, karim, {
    departureTime: "07:10:00",
    location: "Place de la gare, Janzé",
    seats: 2,
  });
  await seedRide(db, eventId, sophie, { departureTime: "07:00:00" });
  await seedRide(db, eventId, sophie, { leg: "retour", departureTime: "18:30:00" });
  await seedPlacement(db, { personId: leo, eventId, leg: "aller", rideId: full });

  await page.goto(organiserPath(seededEvent));
  const aller = section(page, "Aller");
  const cars = list(aller, "Voitures sans numéro (2)");
  await expect(rows(cars)).toHaveCount(2);
  for (const [n, title, where, summary] of [
    [0, "Voiture de Karim", "07:10 · Place de la gare, Janzé", "1 place prise · 1 place libre"],
    [1, "Voiture de Yann", "07:30 · Église, Châteaugiron", "Aucune place prise · 3 places libres"],
  ] as const) {
    const row = rows(cars).nth(n);
    await expect(row.getByText(title, { exact: true })).toBeVisible();
    await expect(row.getByText(where, { exact: true })).toBeVisible();
    await expect(row.getByText(summary, { exact: true })).toBeVisible();
  }
  await expect(aller.getByText(FR.carsHint, { exact: true })).toBeVisible();
  await expect(cars.getByRole("link")).toHaveCount(0);
  await expect(cars.getByRole("button")).toHaveCount(0);
  await expect(aller).not.toContainText("Voiture de Sophie");

  // O2.4 at the aller, O3.2 and O2.4 at the retour: titles at 0, their sentence, no hint.
  await expect(aller.getByRole("heading", { level: 4, name: "Sans voiture (0)", exact: true })).toBeVisible();
  await expect(aller.getByText(FR.withoutCarEmpty, { exact: true })).toBeVisible();
  await expect(aller).not.toContainText(FR.withoutCarHint);
  const retour = section(page, "Retour");
  await expect(retour.getByRole("heading", { level: 4 })).toHaveText(["Sans voiture (0)", "Voitures sans numéro (0)"]);
  await expect(retour.getByText(FR.withoutCarEmpty, { exact: true })).toBeVisible();
  await expect(retour.getByText(FR.carsEmpty, { exact: true })).toBeVisible();
  await expect(retour).not.toContainText(FR.carsHint);
});

test("O5.6, O5.8, O7.4: five lines, then « Afficher… »; each list and each leg unfolds on its own, the focus where it says", async ({
  db,
  page,
  seededEvent,
}) => {
  const eventId = seededEvent.id;
  const names = ["Ana", "Ben", "Cléo", "Dan", "Eva", "Félix", "Gaël"];
  for (const [n, name] of names.entries()) {
    await withoutCar(db, eventId, name, `06 10 20 30 4${n}`, n < 6 ? ["aller", "retour"] : ["aller"]);
  }
  for (const name of ["Ugo", "Vic", "Wen", "Xan", "Yves", "Zoé"]) {
    const { id } = await seedPerson(db, eventId, { firstName: name, phone: null });
    await seedRide(db, eventId, id, { seats: 1 });
  }

  await page.goto(organiserPath(seededEvent));
  const aller = section(page, "Aller");
  const retour = section(page, "Retour");
  const persons = list(aller, "Sans voiture (7)");
  const cars = list(aller, "Voitures sans numéro (6)");
  const back = list(retour, "Sans voiture (6)");
  await expect(rows(persons)).toHaveCount(5);
  await expect(rows(cars)).toHaveCount(5);
  await expect(rows(back)).toHaveCount(5);
  const more = aller.getByRole("button", { name: "Afficher les 2 autres", exact: true });
  await expect(aller.getByRole("button", { name: "Afficher l’autre", exact: true })).toHaveCount(1);
  await expect(retour.getByRole("button", { name: "Afficher l’autre", exact: true })).toHaveCount(1);
  expect((await box(more)).height).toBeGreaterThanOrEqual(44);
  expect((await box(more)).width).toBeGreaterThanOrEqual((await box(persons)).width);

  // By keyboard: the list unfolds, the focus on the 6th first name, its ring as wide as the text.
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(rows(persons)).toHaveCount(7);
  const sixth = rows(persons).nth(5).getByText("Félix", { exact: true });
  await expect(sixth).toBeFocused();
  expect(await sixth.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  expect((await box(sixth)).width).toBeLessThan((await box(rows(persons).nth(5))).width / 2);
  await expect(aller.getByRole("heading", { level: 4, name: "Sans voiture (7)", exact: true })).toBeVisible();
  // The others did not move.
  await expect(rows(cars)).toHaveCount(5);
  await expect(rows(back)).toHaveCount(5);

  // « Réduire la liste »: back to five, the focus kept.
  const less = aller.getByRole("button", { name: FR.less, exact: true });
  await less.focus();
  await page.keyboard.press("Enter");
  await expect(rows(persons)).toHaveCount(5);
  await expect(more).toBeFocused();

  // The cars: the focus on the 6th car's title.
  await aller.getByRole("button", { name: "Afficher l’autre", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(rows(cars)).toHaveCount(6);
  await expect(rows(cars).nth(5).getByText(/^Voiture de /)).toBeFocused();
  await expect(rows(persons)).toHaveCount(5);
  await expect(rows(back)).toHaveCount(5);
});

test("O7.3: a first name of 40 and a place of 120 characters do not overflow at 360 px; the number stays on the right", async ({
  db,
  page,
  seededEvent,
}) => {
  const long = "W".repeat(40);
  await withoutCar(db, seededEvent.id, long, "06 12 34 56 78", ["aller"]);
  const { id } = await seedPerson(db, seededEvent.id, { firstName: `D${"W".repeat(39)}`, phone: null });
  await seedRide(db, seededEvent.id, id, { location: "L".repeat(120) });

  await page.goto(organiserPath(seededEvent));
  const aller = section(page, "Aller");
  const row = rows(list(aller, "Sans voiture (1)")).first();
  await expect(row).toBeVisible();
  await expect(aller.getByText(/^07:15 · L+$/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBe(0);

  // The first name's cell and the link start on the same line, the link on its right.
  const name = await box(row.getByText(long, { exact: true }).locator(".."));
  const link = await box(row.locator(tel));
  const own = await box(row);
  expect(name.height).toBeGreaterThan(link.height);
  expect(Math.abs(name.y - link.y)).toBeLessThanOrEqual(1);
  expect(link.x).toBeGreaterThanOrEqual(name.x + name.width - 1);
  expect(link.x + link.width).toBeLessThanOrEqual(own.x + own.width + 1);
  for (const each of await aller.getByRole("listitem").all()) {
    expect(await each.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  }
});
