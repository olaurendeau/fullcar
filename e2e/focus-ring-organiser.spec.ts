import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { leaveNoToken } from "./fixtures";
import { walk } from "./focus-ring";
import { expect, organiserPath, test } from "./organiser";

/*
 * #323, epic #236: the focus ring of the language-switch design (v3.3.1) in the organiser
 * area, F1.7. Each test runs under the fixture `organiserTraffic` (O6.1, O2.10). Its scene has
 * no number at all, and the walk stops before the legs' sections: no message can show one, nor
 * the token, which no focusable element carries.
 */

leaveNoToken();

const FR = {
  panel: "Espace organisateur",
  refresh: "Actualiser",
  shareLink: "Lien à partager",
  adminLink: "Lien d’organisateur",
  copy: "Copier",
  share: "Partager",
};

const panel = (page: Page) => page.getByRole("region", { name: FR.panel });
const toggle = (page: Page) => page.getByRole("button", { name: FR.panel, exact: true });
/** A link's group, named by its label and, for the organiser's link, its badge. */
const group = (page: Page, name: string) => panel(page).getByRole("group", { name });

/** Aller: Anaïs drives Bastien, Chloé is without a car; nobody has a number. Both legs have a tile. */
async function seedScene(db: Kysely<Database>, eventId: string) {
  const person = async (firstName: string) => (await seedPerson(db, eventId, { firstName, phone: null })).id;
  const [anais, bastien, chloe] = [await person("Anaïs"), await person("Bastien"), await person("Chloé")];
  const ride = await seedRide(db, eventId, anais);
  await seedPlacement(db, { personId: bastien, eventId, leg: "aller", rideId: ride });
  await seedPlacement(db, { personId: chloe, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: chloe, eventId, leg: "retour", rideId: null });
}

test.use({ locale: "fr-FR" });

test("F1.7: on /e/{id}/admin, the fold button shows the ring at -2 px; a tile, « Copier », « Partager » and « Actualiser » show it", async ({
  page,
  db,
  seededEvent,
}) => {
  await seedScene(db, seededEvent.id);
  // Before the page loads: Chromium headless has no native sharing, and « Partager » would be absent.
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { configurable: true, value: async () => {} }));
  await page.goto(organiserPath(seededEvent));
  const adminCopy = group(page, FR.adminLink).getByRole("button", { name: FR.copy, exact: true });
  await expect(adminCopy).toBeVisible();
  await expect(group(page, FR.shareLink).getByRole("button", { name: FR.share, exact: true })).toBeVisible();

  // From the top of the page, every element Tab reaches down to the organiser's « Copier ».
  const reached = await walk(page, { until: adminCopy, offsets: [[toggle(page), -2]] });
  const area = reached.slice(reached.indexOf(`<button> "${FR.panel}"`));
  expect(area.slice(0, 2), "the fold button, then « Actualiser »").toEqual([`<button> "${FR.panel}"`, `<button> "${FR.refresh}"`]);
  expect(area.slice(2, 4), "a tile per leg").toEqual([expect.stringMatching(/^<button> "Aller/), expect.stringMatching(/^<button> "Retour/)]);
  expect(area.slice(4), "the links").toEqual([`<button> "${FR.copy}"`, `<button> "${FR.share}"`, `<button> "${FR.copy}"`]);
});
