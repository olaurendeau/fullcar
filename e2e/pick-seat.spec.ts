import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide, seedStop } from "@/db/test-participants";
import { holdToken, messages, newToken, recordBar, said } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #983, event-board v5.2 (« N’importe qui place n’importe qui »), PL3.2, PL3.8, PL3.9: « Trouver une
// place » for a person of another device, and the mode it enters: the next tap on a free seat of the
// leg seats her alone.

type Db = Kysely<Database>;

const PICK = "Touchez une place libre pour y placer Léa.";
const LEA_PLACED = "Léa est dans la voiture de Sophie";

/**
 * The device holds Tom. Léa and Hugo are of other devices.
 * Aller: Sophie drives (3 seats, 07:00), Nina too (4 seats, 08:00) with two points, Prelles and Briançon;
 * Tom, Léa and Hugo are without a car. Retour: Marc drives; Tom and Léa are without a car.
 * With `full`, Sophie's only seat is taken and Nina does not drive: the aller has no free seat.
 */
async function seedScene(db: Db, eventId: string, token: string, full = false) {
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const tom = (await seedPerson(db, eventId, { firstName: "Tom" }, token)).id;
  const lea = await other("Léa");
  const hugo = await other("Hugo");
  const sophie = await seedRide(db, eventId, await other("Sophie"), { departureTime: "07:00:00", seats: full ? 1 : 3 });
  const nina = full ? undefined : await seedRide(db, eventId, await other("Nina"), { departureTime: "08:00:00", seats: 4, location: "Champcella" });
  const marc = await seedRide(db, eventId, await other("Marc"), { leg: "retour", departureTime: "17:30:00" });
  if (full) await seedPlacement(db, { personId: await other("Zoé"), eventId, leg: "aller", rideId: sophie });
  if (nina) {
    await seedStop(db, eventId, nina, { location: "Prelles boucherie", time: "08:25:00" });
    await seedStop(db, eventId, nina, { location: "Briançon carrefour", time: "08:35:00" });
  }
  for (const personId of [tom, lea, hugo]) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  for (const personId of [tom, lea]) await seedPlacement(db, { personId, eventId, leg: "retour", rideId: null });
  return { tom, lea, hugo, sophie, nina, marc };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

/** A person's Ride on the aller, `null` without a car. */
async function rideOf(db: Db, eventId: string, personId: string) {
  const row = await db.selectFrom("placement").select(["ride_id", "stop_id"]).where("event_id", "=", eventId).where("person_id", "=", personId).where("leg", "=", "aller").executeTakeFirstOrThrow();
  return { rideId: row.ride_id, stopId: row.stop_id };
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const seat = (page: Page, driver: string) => car(page, driver).getByRole("button", { name: /^Place libre : / }).first();
const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`^${name}`) });
const person = (page: Page, firstName: string) =>
  panel(page).getByRole("region", { name: "Sans voiture" }).getByRole("button", { name: firstName, exact: true });
const sheet = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
const barUndo = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" });

/** « Trouver une place » from the sheet of `firstName` on the aller's list. */
async function findSeat(page: Page, firstName: string) {
  await person(page, firstName).click();
  const dialog = sheet(page, `${firstName} · Aller`);
  expect(await dialog.getByRole("button").allTextContents()).toEqual(["Trouver une place", "Ne fait pas l’aller", "Fermer"]);
  await expect(dialog.getByRole("button", { name: "Trouver une place" })).toHaveAttribute("data-variant", "default");
  await dialog.getByRole("button", { name: "Trouver une place" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function selectTab(page: Page, name: string) {
  const target = tab(page, name);
  await expect(async () => {
    await target.click();
    await expect(target).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

/** The mode is over: the bar is silent, and the next tap on Sophie's seat follows today's rule, Tom alone going in. */
async function backToToday(page: Page, db: Db, eventId: string, scene: Scene) {
  await expect(messages(page)).toHaveCount(0);
  await seat(page, "Sophie").click();
  await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sophie"]);
  expect(await rideOf(db, eventId, scene.tom)).toEqual({ rideId: scene.sophie, stopId: null });
  expect(await rideOf(db, eventId, scene.lea)).toEqual({ rideId: null, stopId: null });
}

test.describe("« Trouver une place » for a person of another device", () => {
  test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    // The device's persons are known: a sheet opened before is the one of any person.
    await expect(page.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: /^Tom, Aller : / })).toBeVisible();
  });

  test("PL3.2, PL3.8: the sheet closes, the focus goes to the first free seat, the bar says it once; the tap seats Léa alone, « Annuler » gives her back", async ({ db, page, seededEvent }) => {
    const record = await recordBar(page);
    await findSeat(page, "Léa");
    await expect(tab(page, "Aller")).toHaveAttribute("aria-selected", "true");
    // Sophie leaves first.
    await expect(seat(page, "Sophie")).toBeFocused();
    await expect(messages(page)).toHaveText([PICK]);
    // Nothing placed yet, and the information said once (PL4.2).
    expect(await rideOf(db, seededEvent.id, scene.lea)).toEqual({ rideId: null, stopId: null });
    await expect.poll(async () => said((await record()).writes, "status")).toEqual([PICK]);

    // Tom is the only person of the device without a car: the tap would seat him. Not in the mode.
    await seat(page, "Sophie").click();
    await expect(messages(page)).toHaveText([LEA_PLACED]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await rideOf(db, seededEvent.id, scene.lea)).toEqual({ rideId: scene.sophie, stopId: null });
    expect(await rideOf(db, seededEvent.id, scene.tom)).toEqual({ rideId: null, stopId: null });
    await expect(barUndo(page)).toBeVisible();
    await expect.poll(async () => said((await record()).writes, "status")).toEqual([PICK, LEA_PLACED]);

    await barUndo(page).click();
    await expect.poll(() => rideOf(db, seededEvent.id, scene.lea)).toEqual({ rideId: null, stopId: null });
    await expect(person(page, "Léa")).toBeVisible();
    expect(await rideOf(db, seededEvent.id, scene.tom)).toEqual({ rideId: null, stopId: null });
  });

  test("PL3.8: « Fermer » of the bar ends the mode, the line goes with it", async ({ db, page, seededEvent }) => {
    await findSeat(page, "Léa");
    await expect(messages(page)).toHaveText([PICK]);
    await barClose(page).click();
    await backToToday(page, db, seededEvent.id, scene);
  });

  test("PL3.8: opening another sheet ends the mode", async ({ db, page, seededEvent }) => {
    await findSeat(page, "Léa");
    await expect(messages(page)).toHaveText([PICK]);
    await person(page, "Hugo").click();
    await expect(sheet(page, "Hugo · Aller")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await backToToday(page, db, seededEvent.id, scene);
  });

  test("PL3.8: the other leg's tab ends the mode (hypothesis for D4)", async ({ db, page, seededEvent }) => {
    await findSeat(page, "Léa");
    await expect(messages(page)).toHaveText([PICK]);
    await selectTab(page, "Retour");
    await expect(messages(page)).toHaveCount(0);
    await selectTab(page, "Aller");
    await backToToday(page, db, seededEvent.id, scene);
  });

  test("ZZ today with Placer", async ({ page }) => {
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Qui monte dans la voiture de Nina ?");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Placer/ }).click();
    await page.waitForTimeout(1500);
    console.log("ZZCOUNT", await page.locator('[role="dialog"]').count());
  });

  test("ZZ after person sheet", async ({ page }) => {
    await person(page, "Hugo").click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Qui monte dans la voiture de Nina ?");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Placer/ }).click();
    await page.waitForTimeout(1500);
    console.log("ZZCOUNT2", await page.locator('[role="dialog"]').count());
  });

  test("ZZ after find seat and Fermer", async ({ page }) => {
    await findSeat(page, "Léa");
    await barClose(page).click();
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Qui monte dans la voiture de Nina ?");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Placer/ }).click();
    await page.waitForTimeout(1500);
    console.log("ZZCOUNT3", await page.locator('[role="dialog"]').count());
  });

  test("PL3.8, état 17: on a car with points the tap opens « Qui monte… ? », Léa alone ticked, the departure ticked", async ({ db, page, seededEvent }) => {
    await findSeat(page, "Léa");
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Qui monte dans la voiture de Nina ?");
    await expect(dialog).toBeVisible();
    // One sheet: a page that renders as it opens would have Next mount it twice.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog.getByRole("checkbox", { name: "Léa" })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Tom" })).not.toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Hugo" })).not.toBeChecked();
    await expect(dialog.getByRole("radio", { name: /Lieu de départ/ })).toBeChecked();
    expect(await rideOf(db, seededEvent.id, scene.lea)).toEqual({ rideId: null, stopId: null });

    await dialog.getByRole("button", { name: /^Placer/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Léa est dans la voiture de Nina"]);
    expect(await rideOf(db, seededEvent.id, scene.lea)).toEqual({ rideId: scene.nina, stopId: null });
    expect(await rideOf(db, seededEvent.id, scene.tom)).toEqual({ rideId: null, stopId: null });
  });
});

test.describe("PL3.9: no free seat on the leg", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();

  test("the bar says there is none, as for a person of the device; no mode, the focus on « Proposer une voiture »", async ({ db, page, seededEvent }) => {
    const scene = await seedScene(db, seededEvent.id, token, true);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("region", { name: "Vos inscriptions" }).getByRole("button", { name: /^Tom, Aller : / })).toBeVisible();
    await findSeat(page, "Léa");
    await expect(messages(page)).toHaveText(["Aucune place libre à l’aller pour l’instant."]);
    await expect(panel(page).getByRole("button", { name: "Proposer une voiture" })).toBeFocused();
    expect(await rideOf(db, seededEvent.id, scene.lea)).toEqual({ rideId: null, stopId: null });
  });
});

test.describe("in English", () => {
  test.use({ locale: "en-GB" });
  const token = newToken();

  test("PL6.1: the button and the line of the bar are in English", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await expect(page.getByRole("region", { name: "Your sign-ups" })).toBeVisible();
    const withoutCar: Locator = panel(page).getByRole("region", { name: "Without a car" });
    await withoutCar.getByRole("button", { name: "Léa", exact: true }).click();
    await page.getByRole("dialog", { name: "Léa · Outbound" }).getByRole("button", { name: "Find a seat" }).click();
    await expect(messages(page)).toHaveText(["Tap a free seat to seat Léa."]);
  });
});
