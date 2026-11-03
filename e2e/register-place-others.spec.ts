import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide, seedStop } from "@/db/test-participants";
import { messages } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #980 (epic #973): on a device without a person, the first registration offers « Placer une
// personne déjà inscrite » (PL2.7, state 18), which takes its place for « Qui monte… ? », nothing
// ticked, and places someone of another device without drawing a token.

type Db = Kysely<Database>;

/**
 * The retour: Camille, of another device, drives (17:30, 3 seats); Hugo, of a third, is without a
 * car; Zoé does not do the retour. `hugo` and `zoe` leave them out.
 */
async function seedScene(db: Db, eventId: string, who: { hugo: boolean; zoe: boolean } = { hugo: true, zoe: true }) {
  const camille = (await seedPerson(db, eventId, { firstName: "Camille" })).id;
  const ride = await seedRide(db, eventId, camille, { leg: "retour", departureTime: "17:30:00", location: "Salle des fêtes" });
  const hugo = (await seedPerson(db, eventId, { firstName: "Hugo" })).id;
  if (who.hugo) await seedPlacement(db, { personId: hugo, eventId, leg: "retour", rideId: null });
  else await seedPlacement(db, { personId: hugo, eventId, leg: "retour", rideId: ride });
  if (who.zoe) await seedPerson(db, eventId, { firstName: "Zoé" });
  return { ride, hugo };
}

const tokenKey = (eventId: string) => `fullcar:personal-token:${eventId}`;
// A boolean, never the value: a failure must not print a personal token in the log (#365).
const hasToken = (page: Page, eventId: string) => page.evaluate((key) => localStorage.getItem(key) !== null, tokenKey(eventId));

test.describe("a device without a person, in French", () => {
  test.use({ locale: "fr-FR" });

  const panel = (page: Page) => page.getByRole("tabpanel");
  const registration = (page: Page) => page.getByRole("dialog", { name: "Ajouter une personne" });
  const sheet = (page: Page) => page.getByRole("dialog", { name: "Qui monte dans la voiture de Camille ?" });
  const link = (page: Page) => page.getByRole("button", { name: "Placer une personne déjà inscrite" });

  async function openRegistration(page: Page, eventId: string) {
    await page.goto(`/e/${eventId}`);
    await page.getByRole("tab", { name: /^Retour/ }).click();
    await panel(page).getByRole("article", { name: "Voiture de Camille" }).getByRole("button", { name: /^Place libre/ }).first().click();
    await expect(registration(page)).toBeVisible();
    await expect(registration(page).getByLabel("Prénom")).toBeVisible();
  }

  test("PL2.7: the link shows with Hugo without a car, and opens the sheet with nothing ticked", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id);
    await openRegistration(page, seededEvent.id);
    await expect(registration(page).getByText("Cette personne prendra une place dans la voiture de Camille.")).toBeVisible();
    await expect(link(page)).toHaveCount(1);

    await link(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(registration(page)).toHaveCount(0);
    await expect(sheet(page).getByText("Il reste 3 places dans cette voiture", { exact: true })).toBeVisible();
    // Hugo is without a car, Zoé does not do the retour: folded. Nothing ticked, « Placer » inactive.
    await expect(sheet(page).getByRole("checkbox")).toHaveCount(1);
    await expect(sheet(page).getByRole("button", { name: /^Autres personnes qui ne font pas le retour/ })).toHaveAttribute("aria-expanded", "false");
    await expect(sheet(page).getByRole("checkbox", { name: "Hugo" })).not.toBeChecked();
    await expect(sheet(page).getByRole("button", { name: /^Placer/ })).toHaveText("Placer");
    await expect(sheet(page).getByRole("button", { name: /^Placer/ })).toHaveAttribute("aria-disabled", "true");
    await expect(sheet(page).getByRole("group", { name: "Vos personnes" })).toHaveCount(0);
    // The first title has no margin above it (states 3, 5, 16 of the design).
    await expect(sheet(page).getByText("Autres personnes sans voiture", { exact: true })).toHaveCSS("margin-top", "0px");
  });

  test("PL2.7: the link shows with only a person who does not do the leg", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, { hugo: false, zoe: true });
    await openRegistration(page, seededEvent.id);
    await expect(link(page)).toHaveCount(1);
  });

  test("PL2.7: the link is out of the DOM when everyone is in a car", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, { hugo: false, zoe: false });
    await openRegistration(page, seededEvent.id);
    await expect(link(page)).toHaveCount(0);
    await expect(registration(page).getByText("Placer une personne déjà inscrite")).toHaveCount(0);
  });

  test("PL2.9, PL4.3: Hugo is seated from a device without a token, nothing is stored, « Annuler » gives him back", async ({ db, page, seededEvent }) => {
    const { hugo, ride } = await seedScene(db, seededEvent.id);
    await openRegistration(page, seededEvent.id);
    await link(page).click();
    await sheet(page).getByRole("checkbox", { name: "Hugo" }).check();
    await sheet(page).getByRole("button", { name: "Placer 1 personne" }).click();
    await expect(messages(page)).toHaveText(["Hugo est dans la voiture de Camille"]);
    await expect(sheet(page)).toHaveCount(0);
    const placementOf = async () => (await db.selectFrom("placement").select("ride_id").where("person_id", "=", hugo).where("leg", "=", "retour").executeTakeFirstOrThrow()).ride_id;
    expect(await placementOf()).toBe(ride);
    // No token was drawn for it.
    expect(await hasToken(page, seededEvent.id)).toBe(false);

    await page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" }).click();
    await expect(page.locator('[role="status"]:has(+ [role="alert"])')).toHaveText("Hugo n’est plus dans la voiture de Camille");
    expect(await placementOf()).toBeNull();
    expect(await hasToken(page, seededEvent.id)).toBe(false);
  });

  test("the browser's « back » comes back to the registration, the focus on the link; then closes the sheet", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id);
    await openRegistration(page, seededEvent.id);
    const url = page.url();
    await link(page).click();
    await expect(sheet(page)).toBeVisible();

    await page.goBack();
    await expect(registration(page)).toBeVisible();
    await expect(registration(page).getByLabel("Prénom")).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    await expect(link(page)).toBeFocused();
    expect(page.url()).toBe(url);

    // And the registration closes as before.
    await page.goBack();
    await expect(registration(page)).toHaveCount(0);
    expect(page.url()).toBe(url);
  });

  test("a registration still places her, and no link was needed", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id);
    await openRegistration(page, seededEvent.id);
    await registration(page).getByLabel("Prénom").fill("Nina");
    await registration(page).getByRole("button", { name: "Valider" }).click();
    await expect(messages(page)).toHaveText(["Nina est dans la voiture de Camille"]);
    await expect(registration(page)).toHaveCount(0);
  });
});

test.describe("a device without a person, a car with Stops", () => {
  test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });

  test("the list puts the focus on the departure, again after the browser's « back » and the link", async ({ db, page, seededEvent }) => {
    // Stops belong to the aller: Camille drives it (08:00), Hugo is without a car.
    const camille = (await seedPerson(db, seededEvent.id, { firstName: "Camille" })).id;
    const ride = await seedRide(db, seededEvent.id, camille, { departureTime: "08:00:00", location: "Salle des fêtes" });
    await seedStop(db, seededEvent.id, ride, { location: "Prelles", time: "08:25:00" });
    const hugo = (await seedPerson(db, seededEvent.id, { firstName: "Hugo" })).id;
    await seedPlacement(db, { personId: hugo, eventId: seededEvent.id, leg: "aller", rideId: null });
    await page.goto(`/e/${seededEvent.id}`);
    await page.getByRole("tabpanel").getByRole("article", { name: "Voiture de Camille" }).getByRole("button", { name: /^Place libre/ }).first().click();
    const registration = page.getByRole("dialog", { name: "Ajouter une personne" });
    const sheet = page.getByRole("dialog", { name: "Qui monte dans la voiture de Camille ?" });
    const departure = sheet.getByRole("radio", { name: /Lieu de départ/ });
    const link = registration.getByRole("button", { name: "Placer une personne déjà inscrite" });

    await link.click();
    await expect(departure).toBeFocused();

    await page.goBack();
    await expect(registration).toBeVisible();
    await expect(link).toBeFocused();

    await link.click();
    await expect(sheet).toBeVisible();
    await expect(departure).toBeFocused();
  });
});

test.describe("a device without a person, in English", () => {
  test.use({ locale: "en-US" });

  test("the link says its words, and the sheet follows", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id);
    await page.goto(`/e/${seededEvent.id}`);
    await page.getByRole("tab", { name: /^Return/ }).click();
    await page.getByRole("article", { name: "Camille’s car" }).getByRole("button", { name: /^Free seat/ }).first().click();
    const registration = page.getByRole("dialog", { name: "Add a person" });
    await expect(registration).toBeVisible();
    await registration.getByRole("button", { name: "Seat someone already signed up" }).click();
    const sheet = page.getByRole("dialog", { name: "Who gets in Camille’s car?" });
    await sheet.getByRole("checkbox", { name: "Hugo" }).check();
    await sheet.getByRole("button", { name: "Seat 1 person" }).click();
    await expect(messages(page)).toHaveText(["Hugo is in Camille’s car"]);
    expect(await hasToken(page, seededEvent.id)).toBe(false);
  });
});
