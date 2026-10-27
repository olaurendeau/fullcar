import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { leaveNoToken } from "./fixtures";
import { walk, type Offset } from "./focus-ring";
import { expect, legButton, organiserPath, test } from "./organiser";

/*
 * #323, epic #236: the focus ring of the language-switch design (v3.3.1) in the organiser
 * area, F1.7. Each test runs under the fixture `organiserTraffic` (O6.1, O2.10). Its scene has
 * no number at all, and the walk stops at the legs' buttons, their sections folded (O9.2): no
 * message can show one, nor the token, which no focusable element carries.
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  refresh: "Actualiser",
  shareLink: "Lien à partager",
  copy: "Copier",
  share: "Partager",
};

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const toggle = (page: Page) => page.getByRole("button", { name: FR.panel, exact: true });
/** The link's group, named by its label. */
const group = (page: Page, name: string) => panel(page).getByRole("group", { name });

/** Aller: Anaïs drives Bastien, Chloé is without a car; nobody has a number. Chloé is without a car at the retour too. */
async function seedScene(db: Kysely<Database>, eventId: string) {
  const person = async (firstName: string) => (await seedPerson(db, eventId, { firstName, phone: null })).id;
  const [anais, bastien, chloe] = [await person("Anaïs"), await person("Bastien"), await person("Chloé")];
  const ride = await seedRide(db, eventId, anais);
  await seedPlacement(db, { personId: bastien, eventId, leg: "aller", rideId: ride });
  await seedPlacement(db, { personId: chloe, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: chloe, eventId, leg: "retour", rideId: null });
}

test.use({ locale: "fr-FR" });

test("F1.7: on /e/{id}/admin, the fold button and the legs' buttons show the ring at -2 px; « Copier », « Partager », « Actualiser » and « Modifier l’événement » show it", async ({
  page,
  db,
  seededEvent,
}) => {
  await seedScene(db, seededEvent.id);
  // Before the page loads: Chromium headless has no native sharing, and « Partager » would be absent.
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => {} }));
  await page.goto(organiserPath(seededEvent));
  const shareCopy = group(page, FR.shareLink).getByRole("button", { name: FR.copy, exact: true });
  await expect(shareCopy).toBeVisible();
  await expect(group(page, FR.shareLink).getByRole("button", { name: FR.share, exact: true })).toBeVisible();

  // From the top of the page, every element Tab reaches down to the button of the retour.
  const offsets = [toggle(page), legButton(page, "aller"), legButton(page, "retour")].map((each): [Locator, Offset] => [each, -2]);
  const reached = await walk(page, { until: legButton(page, "retour"), offsets });
  const area = reached.slice(reached.indexOf(`<button> "${FR.panel}"`));
  expect(area.slice(0, 2), "the fold button, then « Actualiser »").toEqual([`<button> "${FR.panel}"`, `<button> "${FR.refresh}"`]);
  expect(area.slice(2, 4), "the link to share, and no organiser's link (OA7.3)").toEqual([`<button> "${FR.copy}"`, `<button> "${FR.share}"`]);
  expect(area.slice(4), "« Modifier l’événement », then a button per leg").toEqual([
    expect.stringMatching(/^<button> "Modifier/),
    `<button> "Aller"`,
    `<button> "Retour"`,
  ]);
});
