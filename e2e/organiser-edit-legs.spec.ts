import type { Kysely } from "kysely";
import type { Page } from "@playwright/test";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, messages, newToken } from "./device";
import { leaveNoToken } from "./fixtures";
import { areaEditButton, expect, organiserPath, test } from "./organiser";

/*
 * #271, epic #250 (organizer-view v3.3.8): what « Modifier l’événement » does to the legs. A retour
 * that holds nothing goes with no confirmation (M3.1), one is added back with nobody on it (M4.1),
 * and the cars keep their time when their leg moves, which the sheet says (M5). Each test runs
 * under `organiserTraffic` (O6.1, O2.10). Nothing here prints the token, the admin link or a number.
 */

leaveNoToken();
test.use({ locale: "fr-FR" });

const FR = {
  edit: "Modifier l’événement",
  saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
  nobody: "Personne ne s’est encore inscrit.",
  allerCars: "Les 3 voitures déjà proposées pour l’aller gardent leur heure de départ. Prévenez les personnes qui conduisent.",
  allerCar: "La voiture déjà proposée pour l’aller garde son heure de départ. Prévenez les personnes qui conduisent.",
  retourCars: "Les 2 voitures déjà proposées pour le retour gardent leur heure de départ. Prévenez les personnes qui conduisent.",
};

const panel = (page: Page) => page.getByRole("region", { name: "Espace organisateur" });
const editButton = (page: Page) => areaEditButton(page);
const sheet = (page: Page, name = FR.edit) => page.getByRole("dialog", { name });
const field = (page: Page, label: string) => sheet(page).getByLabel(label, { exact: true });
const retourBox = (page: Page) => sheet(page).getByRole("checkbox", { name: "Retour", exact: true });
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });
const header = (page: Page) => page.locator("main header").first();
const board = (page: Page) => page.getByRole("tabpanel");
const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`^${name}`) });
const card = (page: Page, driver: string) => board(page).getByRole("article", { name: `Voiture de ${driver}` });

/** `count` cars on `leg` of event `eventId`, each driven by a new person; the first driver's id. */
async function seedCars(db: Kysely<Database>, eventId: string, leg: "aller" | "retour", count: number, token?: string) {
  const drivers: string[] = [];
  for (let n = 0; n < count; n++) {
    const { id } = await seedPerson(db, eventId, { firstName: `${leg === "aller" ? "Marc" : "Sophie"}${n || ""}` }, token);
    await seedRide(db, eventId, id, { leg, departureTime: leg === "aller" ? "07:15:00" : "18:30:00" });
    drivers.push(id);
  }
  return drivers;
}

async function openSheet(page: Page, path: string) {
  await page.goto(path);
  await editButton(page).click();
  await expect(sheet(page)).toBeVisible();
}

test("M3.1: a retour with no car and no Placement, unchecked: saved with no confirmation, and gone from the header, the board and the panel", async ({
  page,
  db,
  seededEvent,
}) => {
  const tom = (await seedPerson(db, seededEvent.id, { firstName: "Tom" })).id;
  await seedPlacement(db, { personId: tom, eventId: seededEvent.id, leg: "aller", rideId: null });
  await openSheet(page, organiserPath(seededEvent));
  await retourBox(page).click();
  await submit(page).click();

  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(messages(page)).toHaveText([FR.saved]);
  await expect(header(page).locator("dt")).toHaveText(["Début"]);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: /^(Aller|Retour)\b/ })).toHaveCount(1);
  await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(["Aller"]);
  await expect(panel(page).getByText("Retour", { exact: true })).toHaveCount(0);
  // Without a retour, the board is the aller's section, not a tab panel.
  const onlyLeg = page.locator('main section[aria-labelledby="leg-aller"]');
  await expect(onlyLeg).toBeVisible();
  await expect(onlyLeg).toContainText(/Ajouter une personne/);
  await expect(onlyLeg).not.toContainText(/retour/i);
  const stored = await db.selectFrom("event").select("retour_at").where("id", "=", seededEvent.id).executeTakeFirstOrThrow();
  expect(stored.retour_at).toBeNull();

  // Folded, the summary has one line.
  await page.getByRole("button", { name: "Espace organisateur", exact: true }).click();
  await expect(panel(page).locator(":scope > ul > li")).toHaveCount(1);
});

test.describe("without a retour", () => {
  test.use({ eventFields: { retourAt: null } });

  test("M4.1: a retour added at 18:00: « Fin », the tabs with the retour empty; nobody is put on it", async ({ page, browser, baseURL, db, seededEvent }) => {
    const token = newToken();
    const tom = (await seedPerson(db, seededEvent.id, { firstName: "Tom" }, token)).id;
    await seedPlacement(db, { personId: tom, eventId: seededEvent.id, leg: "aller", rideId: null });
    await openSheet(page, organiserPath(seededEvent));
    await retourBox(page).click();
    await field(page, "Heure de fin").fill("18:00");
    await submit(page).click();

    await expect(sheet(page)).toHaveCount(0);
    await expect(messages(page)).toHaveText([FR.saved]);
    await expect(header(page).locator("dt")).toHaveText(["Début", "Fin"]);
    await expect(header(page).locator("dd").nth(1)).toHaveText("18:00");
    await expect(page.getByRole("tab")).toHaveCount(2);
    await expect(tab(page, "Aller")).toHaveAttribute("aria-selected", "true");
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveText(["Aller", "Retour"]);
    await tab(page, "Retour").click();
    await expect(board(page).getByText(FR.nobody, { exact: true })).toBeVisible();

    const placements = await db.selectFrom("placement").select("person_id").where("event_id", "=", seededEvent.id).where("leg", "=", "retour").execute();
    expect(placements.length).toBe(0);

    // On Tom's device, reloaded: Tom does not do the retour.
    const context = await browser.newContext({ locale: "fr-FR", baseURL });
    try {
      const device = await context.newPage();
      await holdToken(device, seededEvent.id, token);
      await device.goto(`/e/${seededEvent.id}`);
      const cell = device.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: /^Tom, Retour : / });
      await expect(cell).toHaveAccessibleName("Tom, Retour : Ne fait pas le retour");
    } finally {
      await context.close();
    }
  });
});

test.describe("M5: the dates and the cars", () => {
  test("M5.1: a leg moved with cars: the sentence under its fields, in their description; put back, it goes; none without a car or with the box unchecked", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedCars(db, seededEvent.id, "aller", 3);
    await seedCars(db, seededEvent.id, "retour", 2);
    await openSheet(page, organiserPath(seededEvent));
    await expect(sheet(page).getByText(/gardent? (leur|son) heure de départ/)).toHaveCount(0);

    await field(page, "Heure de début").fill("14:00");
    await expect(sheet(page).getByText(FR.allerCars, { exact: true })).toBeVisible();
    await expect(field(page, "Date de début")).toHaveAccessibleDescription(FR.allerCars);
    await expect(field(page, "Heure de début")).toHaveAccessibleDescription(FR.allerCars);
    await expect(field(page, "Heure de fin")).toHaveAccessibleDescription("");
    await field(page, "Heure de début").fill("07:30");
    await expect(sheet(page).getByText(FR.allerCars, { exact: true })).toHaveCount(0);
    await expect(field(page, "Heure de début")).toHaveAccessibleDescription("");

    await field(page, "Heure de fin").fill("21:00");
    await expect(field(page, "Date de fin")).toHaveAccessibleDescription(FR.retourCars);
    await expect(field(page, "Heure de fin")).toHaveAccessibleDescription(FR.retourCars);
    await retourBox(page).click();
    await expect(sheet(page).getByText(FR.retourCars, { exact: true })).toHaveCount(0);
  });

  test("M5.1: one car at the aller: the sentence in the singular; none at the retour", async ({ page, db, seededEvent }) => {
    await seedCars(db, seededEvent.id, "aller", 1);
    await openSheet(page, organiserPath(seededEvent));
    await field(page, "Date de début").fill("2026-12-13");
    await expect(field(page, "Heure de début")).toHaveAccessibleDescription(FR.allerCar);
    // The end's date followed the start's: the retour moved, but holds no car.
    await expect(field(page, "Date de fin")).toHaveValue("2026-12-13");
    await expect(field(page, "Date de fin")).toHaveAccessibleDescription("");
  });

  test("M5.2: the start moved to the next day: each car keeps its time, the card shows it, and « Modifier la voiture » says the new date", async ({
    page,
    db,
    seededEvent,
  }) => {
    const token = newToken();
    await seedCars(db, seededEvent.id, "aller", 1, token);
    await holdToken(page, seededEvent.id, token);
    await openSheet(page, organiserPath(seededEvent));
    await field(page, "Date de début").fill("2026-12-13");
    await field(page, "Date de fin").fill("2026-12-13");
    await submit(page).click();
    await expect(messages(page)).toHaveText([FR.saved]);

    const rides = await db.selectFrom("ride").select("departure_time").where("event_id", "=", seededEvent.id).execute();
    expect(rides).toEqual([{ departure_time: "07:15:00" }]);
    await expect(card(page, "Marc")).toContainText("07:15");
    await card(page, "Marc").getByRole("button", { name: "Modifier", exact: true }).click();
    const time = sheet(page, "Modifier la voiture").getByLabel("Heure de départ", { exact: true });
    await expect(time).toHaveValue("07:15");
    await expect(time).toHaveAccessibleDescription("Le dimanche 13 décembre 2026");
  });

  test("M5.3: the start moved to 14:00, « Proposer une voiture » at the aller takes 14:00 for its departure", async ({ page, seededEvent }) => {
    await openSheet(page, organiserPath(seededEvent));
    await field(page, "Heure de début").fill("14:00");
    await submit(page).click();
    await expect(messages(page)).toHaveText([FR.saved]);

    await board(page).getByRole("button", { name: "Proposer une voiture", exact: true }).click();
    await expect(sheet(page, "Proposer une voiture").getByLabel("Heure de départ", { exact: true })).toHaveValue("14:00");
  });
});
