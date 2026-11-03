import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide, seedStop } from "@/db/test-participants";
import { animationsDone, holdToken, messages, newToken } from "./device";
import { contrast } from "./contrast";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #979 (epic #973): « Qui monte dans la voiture de… ? » lists the persons of the other devices
// (PL2.1 to PL2.6, PL2.8, PL2.9, PL4.3, PL5.3, PL6.1, PL6.2, PL6.4).

type Db = Kysely<Database>;

/**
 * The scene of the design's README (« Les critères »), on the retour. Device A (`a`) holds Marc,
 * Tom and Léa; device B (`b`) holds Camille, who drives (17:30, 3 seats, Inès aboard); Hugo, on
 * device C, is without a car. Tom, Hugo and Léa declared it in that order. Marc does not do the
 * retour, nor Zoé, of device D, created last.
 */
async function seedScene(db: Db, eventId: string, tokens: { a: string; b: string }) {
  const person = async (firstName: string, token?: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const marc = await person("Marc", tokens.a);
  const tom = await person("Tom", tokens.a);
  const lea = await person("Léa", tokens.a);
  const camille = await person("Camille", tokens.b);
  const ines = await person("Inès");
  const hugo = await person("Hugo");
  const zoe = await person("Zoé");
  const ride = await seedRide(db, eventId, camille, { leg: "retour", departureTime: "17:30:00", location: "Salle des fêtes" });
  await seedPlacement(db, { personId: ines, eventId, leg: "retour", rideId: ride });
  for (const personId of [tom, hugo, lea]) await seedPlacement(db, { personId, eventId, leg: "retour", rideId: null });
  return { persons: { marc, tom, lea, camille, ines, hugo, zoe }, ride };
}

/** A person's Placements, by leg: a Ride's id, `null` without a car; a leg left out is not concerned. */
async function placements(db: Db, eventId: string, personId: string) {
  const rows = await db.selectFrom("placement").select(["leg", "ride_id"]).where("event_id", "=", eventId).where("person_id", "=", personId).execute();
  return Object.fromEntries(rows.map((row) => [row.leg, row.ride_id]));
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const sheet = (page: Page, driver: string) => page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });
const placeButton = (dialog: Locator) => dialog.getByRole("button", { name: /^Placer/ });
const folded = (dialog: Locator) => dialog.getByRole("button", { name: /^Autres personnes qui ne font pas le retour/ });
const undo = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" });
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');

/** The checkboxes shown in a sheet, each with its first name, the state under it, and whether it is ticked. */
async function candidates(dialog: Locator) {
  return dialog.getByRole("checkbox").evaluateAll((boxes) =>
    boxes.map((box) => {
      const text = (attribute: string) => document.getElementById(box.getAttribute(attribute) ?? "")?.textContent;
      return { name: text("aria-labelledby"), state: text("aria-describedby"), checked: box.getAttribute("aria-checked") === "true" };
    }),
  );
}

/** Opens the sheet from `driver`'s first free seat, on the retour or the aller. */
async function openSheet(page: Page, driver: string, leg: "Aller" | "Retour" = "Retour") {
  await page.getByRole("tab", { name: new RegExp(`^${leg}`) }).click();
  await car(page, driver).getByRole("button", { name: /^Place libre/ }).first().click();
  await expect(sheet(page, driver)).toBeVisible();
  return sheet(page, driver);
}

const WITHOUT = "Sans voiture";
const NOT_RETOUR = "Ne fait pas le retour";

test.describe("the sheet lists the persons of the other devices", () => {
  test.use({ locale: "fr-FR" });
  const tokens = { a: newToken(), b: newToken() };
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, tokens);
  });

  test.describe("on the device of Camille, who drives", () => {
    test.beforeEach(async ({ page, seededEvent }) => {
      await holdToken(page, seededEvent.id, tokens.b);
      await page.goto(`/e/${seededEvent.id}`);
    });

    test("PL2.1, PL2.2, PL2.3, PL2.4, PL2.6: the others without a car in the order they declared it, none ticked, « Placer » inactive", async ({ page }) => {
      const dialog = await openSheet(page, "Camille");
      await expect(dialog.getByText("Il reste 2 places dans cette voiture", { exact: true })).toBeVisible();
      // Camille drives and Inès is in her car: neither is there. Marc and Zoé do not do the retour: folded.
      expect(await candidates(dialog)).toEqual([
        { name: "Tom", state: WITHOUT, checked: false },
        { name: "Hugo", state: WITHOUT, checked: false },
        { name: "Léa", state: WITHOUT, checked: false },
      ]);
      await expect(dialog.getByRole("group", { name: "Autres personnes sans voiture" }).getByRole("checkbox")).toHaveCount(3);
      await expect(dialog.getByRole("group", { name: "Vos personnes" })).toHaveCount(0);
      await expect(placeButton(dialog)).toHaveText("Placer");
      await expect(placeButton(dialog)).toHaveAttribute("aria-disabled", "true");
    });

    test("PL2.5, PL2.6: the persons not on the retour are folded; unfolding and folding tick nothing, and the ticked ones count", async ({ page }) => {
      const dialog = await openSheet(page, "Camille");
      await expect(folded(dialog)).toHaveText("Autres personnes qui ne font pas le retour (2)");
      await expect(folded(dialog)).toHaveAttribute("aria-expanded", "false");

      await dialog.getByRole("checkbox", { name: "Hugo" }).check();
      await expect(placeButton(dialog)).toHaveText("Placer 1 personne");
      await folded(dialog).click();
      await expect(folded(dialog)).toHaveAttribute("aria-expanded", "true");
      // In the event's order, unticked, with their real state.
      expect(await candidates(dialog)).toEqual([
        { name: "Tom", state: WITHOUT, checked: false },
        { name: "Hugo", state: WITHOUT, checked: true },
        { name: "Léa", state: WITHOUT, checked: false },
        { name: "Marc", state: NOT_RETOUR, checked: false },
        { name: "Zoé", state: NOT_RETOUR, checked: false },
      ]);
      await expect(placeButton(dialog)).toHaveText("Placer 1 personne");

      // One of those not on the retour ticked, then folded: still counted.
      await dialog.getByRole("checkbox", { name: "Marc" }).check();
      await expect(placeButton(dialog)).toHaveText("Placer 2 personnes");
      await expect(placeButton(dialog)).not.toHaveAttribute("aria-disabled", "true");
      await folded(dialog).click();
      await expect(folded(dialog)).toHaveAttribute("aria-expanded", "false");
      await expect(dialog.getByRole("checkbox")).toHaveCount(3);
      await expect(placeButton(dialog)).toHaveText("Placer 2 personnes");
      await expect(placeButton(dialog)).not.toHaveAttribute("aria-disabled", "true");
      await folded(dialog).click();
      await expect(dialog.getByRole("checkbox", { name: "Marc" })).toBeChecked();
      await expect(dialog.getByRole("checkbox", { name: "Hugo" })).toBeChecked();

      // Beyond the 2 seats left: inactive, the others counting as anyone.
      await dialog.getByRole("checkbox", { name: "Tom" }).check();
      await expect(placeButton(dialog)).toHaveText("Placer 3 personnes");
      await expect(placeButton(dialog)).toHaveAttribute("aria-disabled", "true");
    });

    test("PL2.9, PL4.2: Camille seats Tom and Léa, who are Marc's; the board shows them and the banner follows", async ({ db, page, seededEvent }) => {
      const dialog = await openSheet(page, "Camille");
      await dialog.getByRole("checkbox", { name: "Tom" }).check();
      await dialog.getByRole("checkbox", { name: "Léa" }).check();
      await placeButton(dialog).click();
      await expect(messages(page)).toHaveText(["Tom et Léa sont dans la voiture de Camille"]);
      // Seated together: no order between Tom and Léa.
      for (const name of ["Inès", "Tom", "Léa"]) await expect(car(page, "Camille").getByRole("listitem").filter({ hasText: name })).toHaveCount(1);
      await expect(car(page, "Camille").getByRole("listitem")).toHaveCount(3);
      await expect(panel(page).getByRole("status").filter({ hasText: "sans voiture" })).toContainText("1 sans voiture");
      expect(await placements(db, seededEvent.id, scene.persons.tom)).toEqual({ retour: scene.ride });
      expect(await placements(db, seededEvent.id, scene.persons.lea)).toEqual({ retour: scene.ride });
    });

    test("PL4.3: « Annuler » gives Hugo back without a car and Marc as not on the retour, whoever's they are", async ({ db, page, seededEvent }) => {
      const dialog = await openSheet(page, "Camille");
      await dialog.getByRole("checkbox", { name: "Hugo" }).check();
      await folded(dialog).click();
      await dialog.getByRole("checkbox", { name: "Marc" }).check();
      await placeButton(dialog).click();
      await expect(messages(page)).toHaveText(["Hugo et Marc sont dans la voiture de Camille"]);
      expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({ retour: scene.ride });
      expect(await placements(db, seededEvent.id, scene.persons.marc)).toEqual({ retour: scene.ride });

      await undo(page).click();
      await expect(barStatus(page)).toHaveText("Hugo et Marc ne sont plus dans la voiture de Camille");
      await expect(car(page, "Camille").getByRole("listitem")).toHaveText(["Inès", "Place libre", "Place libre"]);
      expect(await placements(db, seededEvent.id, scene.persons.hugo)).toEqual({ retour: null });
      expect(await placements(db, seededEvent.id, scene.persons.marc)).toEqual({});
    });

    test("PL6.4: the titles of the groups make 4,5:1 on the sheet", async ({ page }) => {
      const dialog = await openSheet(page, "Camille");
      expect(await contrast(dialog.getByText("Autres personnes sans voiture", { exact: true }), dialog)).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(folded(dialog), dialog)).toBeGreaterThanOrEqual(4.5);
    });
  });

  test("PL2.2, PL2.3, PL2.4: on the device of Marc, his persons first, those without a car ticked, then the others", async ({ page, seededEvent }) => {
    await holdToken(page, seededEvent.id, tokens.a);
    await page.goto(`/e/${seededEvent.id}`);
    const dialog = await openSheet(page, "Camille");
    // The device's order, without a car and not concerned mixed; then the others without a car.
    expect(await candidates(dialog)).toEqual([
      { name: "Marc", state: NOT_RETOUR, checked: false },
      { name: "Tom", state: WITHOUT, checked: true },
      { name: "Léa", state: WITHOUT, checked: true },
      { name: "Hugo", state: WITHOUT, checked: false },
    ]);
    await expect(dialog.getByRole("group", { name: "Vos personnes" }).getByRole("checkbox")).toHaveCount(3);
    await expect(dialog.getByRole("group", { name: "Autres personnes sans voiture" }).getByRole("checkbox")).toHaveCount(1);
    await expect(folded(dialog)).toHaveText("Autres personnes qui ne font pas le retour (1)");
    await expect(placeButton(dialog)).toHaveText("Placer 2 personnes");
  });

  test("PL6.1: in English, the groups and the folded list say the words of the design", async ({ browser, seededEvent }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await holdToken(page, seededEvent.id, tokens.a);
    await page.goto(`/e/${seededEvent.id}`);
    await page.getByRole("tab", { name: /^Return/ }).click();
    await page.getByRole("article", { name: "Camille’s car" }).getByRole("button", { name: /^Free seat/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Who gets in Camille’s car?" });
    await expect(dialog.getByText("Your people", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Other people without a car", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Other people not on the return trip (1)" })).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByRole("button", { name: "Seat 2 people" })).toBeVisible();
    await context.close();
  });
});

test.describe("without a person of another device", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test("PL2.4, PL2.5: the sheet is today's, with no title and no folded list", async ({ db, page, seededEvent }) => {
    const mine = async (firstName: string) => (await seedPerson(db, seededEvent.id, { firstName }, token)).id;
    const tom = await mine("Tom");
    const lea = await mine("Léa");
    await mine("Hugo");
    const sophie = (await seedPerson(db, seededEvent.id, { firstName: "Sophie" })).id;
    await seedRide(db, seededEvent.id, sophie);
    for (const personId of [tom, lea]) await seedPlacement(db, { personId, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const dialog = await openSheet(page, "Sophie", "Aller");
    expect(await candidates(dialog)).toEqual([
      { name: "Tom", state: WITHOUT, checked: true },
      { name: "Léa", state: WITHOUT, checked: true },
      { name: "Hugo", state: "Ne fait pas l’aller", checked: false },
    ]);
    await expect(dialog.getByRole("group")).toHaveCount(0);
    await expect(dialog.locator("[aria-expanded]")).toHaveCount(0);
    await expect(dialog.getByText(/^(Vos personnes|Autres personnes)/)).toHaveCount(0);
  });

  test("PL2.8: nobody left to place, whichever the device: the sheet says everyone is in a car", async ({ db, page, seededEvent }) => {
    const camille = (await seedPerson(db, seededEvent.id, { firstName: "Camille" }, token)).id;
    const ines = (await seedPerson(db, seededEvent.id, { firstName: "Inès" })).id;
    const ride = await seedRide(db, seededEvent.id, camille, { leg: "retour" });
    await seedPlacement(db, { personId: ines, eventId: seededEvent.id, leg: "retour", rideId: ride });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const dialog = await openSheet(page, "Camille");
    await expect(dialog.getByText("Tout le monde est déjà dans une voiture pour le retour.", { exact: true })).toBeVisible();
    expect(await dialog.getByRole("button").allTextContents()).toEqual(["Ajouter une personne", "Fermer"]);
  });
});

test.describe("a car with Stops", () => {
  test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });
  const token = newToken();

  test("PL5.3: the point chosen applies to every person ticked, of any device, the departure ticked as it opens", async ({ db, page, seededEvent }) => {
    const camille = (await seedPerson(db, seededEvent.id, { firstName: "Camille" }, token)).id;
    const tom = (await seedPerson(db, seededEvent.id, { firstName: "Tom" })).id;
    const lea = (await seedPerson(db, seededEvent.id, { firstName: "Léa" })).id;
    const ride = await seedRide(db, seededEvent.id, camille, { departureTime: "08:00:00", location: "Salle des fêtes" });
    const prelles = await seedStop(db, seededEvent.id, ride, { location: "Prelles", time: "08:25:00" });
    for (const personId of [tom, lea]) await seedPlacement(db, { personId, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const dialog = await openSheet(page, "Camille", "Aller");

    const points = dialog.getByRole("radiogroup", { name: "Point de montée" });
    await expect(points.getByRole("radio", { name: "Salle des fêtes · 08:00 · Lieu de départ" })).toBeChecked();
    await dialog.getByRole("checkbox", { name: "Tom" }).check();
    await dialog.getByRole("checkbox", { name: "Léa" }).check();
    await points.getByRole("radio", { name: /Prelles/ }).check();
    await placeButton(dialog).click();
    await expect(messages(page).first()).toContainText("Tom et Léa");
    for (const personId of [tom, lea]) {
      const row = await db.selectFrom("placement").select(["ride_id", "stop_id"]).where("person_id", "=", personId).where("leg", "=", "aller").executeTakeFirstOrThrow();
      expect({ ride: row.ride_id, stop: row.stop_id }).toEqual({ ride, stop: prelles });
    }
  });
});

test.describe("at 360 px with 40 persons", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 640 } });
  const token = newToken();

  test("PL6.2: the body scrolls, « Placer » and « Fermer » stay in view, nothing overflows sideways", async ({ db, page, seededEvent }) => {
    const camille = (await seedPerson(db, seededEvent.id, { firstName: "Camille" }, token)).id;
    await seedRide(db, seededEvent.id, camille, { leg: "retour" });
    for (let index = 1; index <= 40; index++) {
      const { id } = await seedPerson(db, seededEvent.id, { firstName: `Personne ${index}` });
      await seedPlacement(db, { personId: id, eventId: seededEvent.id, leg: "retour", rideId: null });
    }
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const dialog = await openSheet(page, "Camille");
    await expect(dialog.getByRole("checkbox")).toHaveCount(40);
    // Measured once the sheet has slid in.
    await animationsDone(dialog);

    expect(await dialog.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const inView = async (button: Locator) => {
      const box = (await button.boundingBox())!;
      return box.y >= 0 && box.y + box.height <= 640;
    };
    for (const to of [0, 100_000]) {
      await dialog.evaluate((element, top) => element.scrollTo({ top, behavior: "instant" }), to);
      expect(await inView(placeButton(dialog)), `Placer, scrolled to ${to}`).toBe(true);
      expect(await inView(dialog.getByRole("button", { name: "Fermer" })), `Fermer, scrolled to ${to}`).toBe(true);
    }
    // The last person is reached by scrolling.
    await expect(dialog.getByRole("checkbox", { name: "Personne 40" })).toBeInViewport();
  });
});
