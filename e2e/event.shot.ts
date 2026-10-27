import type { Page, TestInfo } from "@playwright/test";
import { anonymiseEvent } from "@/db/day-thirty";
import { confirmSeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { DRIVER_PHONE } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";
import { areaRefused, keepAdminToken, organiserPath } from "./organiser";

leaveNoToken();

/*
 * #3, C7.2: the pages of an event at WIDTH px (360 by default), without scrolling sideways.
 * `/` empty is home.shot.ts's. Each capture waits for a sign that the page has hydrated:
 * a capture of a page that never did would show what nobody sees (#65).
 */

/** A well-formed id that no test stores. */
const UNKNOWN_ID = "Zz9yXw8v";

const FIELDS = ["Titre", "Lieu", "Date de début", "Heure de début", "Date de fin", "Heure de fin"];

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  // Transitions finished: a tab just clicked is shown in its final state.
  await page.screenshot({
    path: `var/shots/${name}-${testInfo.project.use.viewport?.width}.png`,
    fullPage: true,
    animations: "disabled",
    // The links masked, the organiser's with its token: a capture may be shared in a PR or an issue.
    mask: [page.getByTestId("link")],
  });
}

test.use({ locale: "fr-FR" });

test("the creation form, every error shown", async ({ page }, testInfo) => {
  await page.goto("/nouveau");
  // Inactive until hydrated.
  await expect(page.getByRole("button", { name: "Créer" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Créer" }).click();
  for (const label of FIELDS) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAccessibleDescription("Champ requis.");
  }
  await shoot(page, testInfo, "new-event-errors");
});

test("organiser's page, with a retour", async ({ page, seededEvent }, testInfo) => {
  await keepAdminToken(page, seededEvent.id, seededEvent.token);
  await page.goto(organiserPath(seededEvent));
  // Shown once the client has checked the token with the server.
  await expect(page.getByRole("region", { name: "Espace organisateur" })).toBeVisible();
  await shoot(page, testInfo, "event-admin");
});

test("event, Aller then Retour tab", async ({ page, seededEvent }, testInfo) => {
  const tab = (name: string) => page.getByRole("tab", { name });
  await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
  await expect(tab("Aller")).toHaveAttribute("aria-selected", "true");

  // One click each, not retried: a page that has not hydrated stays on Aller, and the
  // Aller capture is taken only once Retour has been selected and left.
  await tab("Retour").click();
  await expect(tab("Retour")).toHaveAttribute("aria-selected", "true");
  await tab("Aller").click();
  await expect(tab("Aller")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Aucune voiture proposée pour l’aller");
  await shoot(page, testInfo, "event-aller");

  await tab("Retour").click();
  await expect(tab("Retour")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Aucune voiture proposée pour le retour");
  await shoot(page, testInfo, "event-retour");
});

// C3.6: Claire drives the aller and needs a seat back, Léa rides with her and needs one too, Tom only goes.
test("« Vos inscriptions », unfolded then folded", async ({ db, page, seededEvent }, testInfo) => {
  const token = newToken();
  const eventId = seededEvent.id;
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const claire = await mine("Claire");
  const lea = await mine("Léa");
  const tom = await mine("Tom");
  const clairesCar = await seedRide(db, eventId, claire);
  await seedPlacement(db, { personId: lea, eventId, leg: "aller", rideId: clairesCar });
  await seedPlacement(db, { personId: tom, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: claire, eventId, leg: "retour", rideId: null });
  await seedPlacement(db, { personId: lea, eventId, leg: "retour", rideId: null });
  await holdToken(page, eventId, token);
  await page.goto(`/e/${eventId}`, { waitUntil: "networkidle" });
  const toggle = page.getByRole("button", { name: /^Vos inscriptions/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await shoot(page, testInfo, "vos-inscriptions-depliee");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await shoot(page, testInfo, "vos-inscriptions-repliee");
});

// C4.7: Claire and Léa on the device, none chosen to drive, the place left empty, too many seats.
test("« Proposer une voiture » with errors", async ({ db, page, seededEvent }, testInfo) => {
  const token = newToken();
  for (const firstName of ["Claire", "Léa"]) await seedPerson(db, seededEvent.id, { firstName }, token);
  await holdToken(page, seededEvent.id, token);
  await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
  await page.getByRole("tabpanel").getByRole("button", { name: "Proposer une voiture" }).click();
  const sheet = page.getByRole("dialog", { name: "Proposer une voiture" });
  await sheet.getByLabel("Places, sans compter qui conduit").fill("9");
  await sheet.getByRole("button", { name: "Valider" }).click();
  await expect(sheet.getByRole("radiogroup", { name: "Qui conduit ?" })).toHaveAccessibleDescription(
    "Choisissez qui conduit.",
  );
  await shoot(page, testInfo, "proposer-voiture-erreurs");
});

// C11.2, #169, #171: Léa, with a number, a passenger of Marc on the retour, also drives back: « Au retour »
// unfolded; Tom and Nina, of her device, without a car at the aller, ride with her.
test("« Proposer une voiture » with « Au retour » unfolded and « Qui monte avec vous ? »", async ({ db, page, seededEvent }, testInfo) => {
  const { id } = seededEvent;
  const token = newToken();
  const marc = await seedPerson(db, id, { firstName: "Marc" });
  const lea = await seedPerson(db, id, { firstName: "Léa", phone: DRIVER_PHONE }, token);
  await seedPlacement(db, { personId: lea.id, eventId: id, leg: "retour", rideId: await seedRide(db, id, marc.id, { leg: "retour" }) });
  for (const firstName of ["Tom", "Nina"]) {
    const { id: personId } = await seedPerson(db, id, { firstName }, token);
    await seedPlacement(db, { personId, eventId: id, leg: "aller", rideId: null });
  }
  await holdToken(page, id, token);
  await page.goto(`/e/${id}`, { waitUntil: "networkidle" });
  await page.getByRole("tabpanel").getByRole("button", { name: "Proposer une voiture" }).click();
  const sheet = page.getByRole("dialog", { name: "Proposer une voiture" });
  await sheet.getByRole("radio", { name: "Léa", exact: true }).check();
  for (const name of ["Tom", "Nina"]) await sheet.getByRole("checkbox", { name, exact: true }).check();
  await sheet.getByLabel("Lieu de départ", { exact: true }).fill("Église de Saint-Grégoire");
  await sheet.getByRole("radio", { name: "Je ramène aussi des personnes" }).check();
  await expect(sheet.getByLabel("Lieu de dépose", { exact: true })).toHaveValue("Église de Saint-Grégoire");
  expect(await sheet.evaluate((element) => element.scrollWidth - element.clientWidth), "the sheet scrolls sideways").toBe(0);
  // The sheet scrolls inside it: its end in view, « Au retour » unfolded above « Qui monte avec vous ? ».
  await sheet.getByRole("button", { name: "Valider" }).scrollIntoViewIfNeeded();
  await shoot(page, testInfo, "proposer-voiture-au-retour");
});

// C8.6, C11.2: Claire, of the device, drives Nina and Paul; « Retirer la voiture ? ».
test("« Retirer la voiture ? »", async ({ db, page, seededEvent }, testInfo) => {
  const token = newToken();
  const eventId = seededEvent.id;
  const claire = (await seedPerson(db, eventId, { firstName: "Claire" }, token)).id;
  const clairesCar = await seedRide(db, eventId, claire);
  for (const firstName of ["Nina", "Paul"]) {
    const personId = (await seedPerson(db, eventId, { firstName })).id;
    await seedPlacement(db, { personId, eventId, leg: "aller", rideId: clairesCar });
  }
  await holdToken(page, eventId, token);
  await page.goto(`/e/${eventId}`, { waitUntil: "networkidle" });
  await page.getByRole("tabpanel").getByRole("button", { name: "Retirer la voiture" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("2 personnes redeviendront sans voiture.");
  await shoot(page, testInfo, "retirer-voiture");
});

// C11.2, C8.4: Claire, of the device, drives Nina and Paul, and goes down to one seat.
test("« Qui sort de la voiture ? »", async ({ db, page, seededEvent }, testInfo) => {
  const { id } = seededEvent;
  const token = newToken();
  const claire = await seedPerson(db, id, { firstName: "Claire" }, token);
  const rideId = await seedRide(db, id, claire.id);
  for (const firstName of ["Nina", "Paul"]) {
    await seedPlacement(db, { personId: (await seedPerson(db, id, { firstName })).id, eventId: id, leg: "aller", rideId });
  }
  await holdToken(page, id, token);
  await page.goto(`/e/${id}`, { waitUntil: "networkidle" });
  await page.getByRole("article", { name: "Voiture de Claire" }).getByRole("button", { name: "Modifier" }).click();
  await page.getByLabel("Places, sans compter qui conduit").fill("1");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("dialog", { name: "Qui sort de la voiture ?" }).getByRole("checkbox", { name: "Nina" })).toBeFocused();
  await shoot(page, testInfo, "qui-sort");
});

test.describe("without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  test("event, without a retour", async ({ page, seededEvent }, testInfo) => {
    await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
    await expect(page.getByText("Aucune voiture proposée pour l’aller")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    await shoot(page, testInfo, "event-sans-retour");
  });
});

test("event not found", async ({ page }, testInfo) => {
  const response = await page.goto(`/e/${UNKNOWN_ID}`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(404);
  // The 404's title is streamed after its content: waited for, the page settled (#97 review).
  await expect(page).toHaveTitle("Événement introuvable");
  await shoot(page, testInfo, "event-introuvable");
});

// #590, OA8.3: the link of an event anonymised at day 30.
test("event ended", async ({ db, page, seededEvent }, testInfo) => {
  const accountId = await confirmSeededEvent(db, seededEvent.id);
  try {
    await anonymiseEvent(db, seededEvent.id);
    const response = await page.goto(`/e/${seededEvent.id}`, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Événement terminé");
    await shoot(page, testInfo, "event-termine");
  } finally {
    await db.deleteFrom("account").where("id", "=", accountId).execute();
  }
});

test("organiser area, refused", async ({ page, seededEvent }, testInfo) => {
  await page.goto(organiserPath(seededEvent));
  // Shown once the client has had the server's answer: the screen of a pending event (#598).
  await expect(areaRefused(page)).toBeVisible();
  await shoot(page, testInfo, "event-admin-refuse");
});
