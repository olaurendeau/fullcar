import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, messages, newToken, recordBar, said } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #172: « Trouver une place », the first action of a cell « Sans voiture » (C3.8, v4-6). It
// places nobody: the leg's tab active, the focus on the first free seat of the first car that has one.

type Db = Kysely<Database>;

const TOM_PLACED = "Tom est dans la voiture de Sophie";
const NO_SEAT = "Aucune place libre au retour pour l’instant.";
const LEA_FAILED = "Léa · Retour : « Ne fait pas le retour » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";

/**
 * The device holds Tom and Léa. Aller: Sophie drives nobody, Tom is without a car, Léa is not
 * concerned. Retour: Léa is without a car, Tom too if `tomWithoutCar`, and the cars of `retour`,
 * stored in this order: a car with no free seat carries a passenger of another device.
 */
async function seedScene(db: Db, eventId: string, token: string, retour: { driver: string; time: string; free: number }[], tomWithoutCar = false) {
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const tom = (await seedPerson(db, eventId, { firstName: "Tom" }, token)).id;
  const lea = (await seedPerson(db, eventId, { firstName: "Léa" }, token)).id;
  const sophie = await seedRide(db, eventId, await other("Sophie"), { departureTime: "07:00:00" });
  await seedPlacement(db, { personId: tom, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: lea, eventId, leg: "retour", rideId: null });
  if (tomWithoutCar) await seedPlacement(db, { personId: tom, eventId, leg: "retour", rideId: null });
  const rides: Record<string, string> = {};
  for (const { driver, time, free } of retour) {
    const rideId = (rides[driver] = await seedRide(db, eventId, await other(driver), { leg: "retour", departureTime: time, seats: Math.max(free, 1) }));
    if (free === 0) await seedPlacement(db, { personId: await other(`Avec ${driver}`), eventId, leg: "retour", rideId });
  }
  return { tom, lea, sophie, rides };
}

/** A person's Placements, by leg: a Ride's id, `null` without a car; a leg left out is not concerned. */
async function placements(db: Db, eventId: string, personId: string) {
  const rows = await db.selectFrom("placement").select(["leg", "ride_id"]).where("event_id", "=", eventId).where("person_id", "=", personId).execute();
  return Object.fromEntries(rows.map((row) => [row.leg, row.ride_id]));
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const seat = (page: Page, driver: string) => car(page, driver).getByRole("button", { name: /^Place libre : / }).first();
const tab = (page: Page, leg: "Aller" | "Retour") => page.getByRole("tab", { name: new RegExp(`^${leg}`) });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const sheet = (page: Page, title: string) => page.getByRole("dialog", { name: title });
const offer = (page: Page) => panel(page).getByRole("button", { name: "Proposer une voiture" });
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });

/** Tom boards Sophie's car in one tap: the bar says so, and its region too, 100 ms later (C5.2). */
async function placeTom(page: Page) {
  await seat(page, "Sophie").click();
  await expect(messages(page)).toHaveText([TOM_PLACED]);
  await expect(barStatus(page)).toHaveText(TOM_PLACED);
}

/** « Trouver une place » from Léa's cell of the retour, the aller's tab active. */
async function findSeat(page: Page) {
  await expect(tab(page, "Aller")).toHaveAttribute("aria-selected", "true");
  await cell(page, "Léa", "Retour").click();
  const lea = sheet(page, "Léa · Retour");
  expect(await lea.getByRole("button").allTextContents()).toEqual(["Trouver une place", "Ne fait pas le retour", "Fermer"]);
  await expect(lea.getByRole("button", { name: "Trouver une place" })).toHaveAttribute("data-variant", "default");
  await lea.getByRole("button", { name: "Trouver une place" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(tab(page, "Retour")).toHaveAttribute("aria-selected", "true");
}

test.describe("« Trouver une place »", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  // Stored out of time order: Marc's car leaves first and is full, Zoé's leaves before Paul's.
  const cars = [
    { driver: "Paul", time: "18:30:00", free: 2 },
    { driver: "Marc", time: "17:00:00", free: 0 },
    { driver: "Zoé", time: "18:00:00", free: 3 },
  ];

  test("C3.8, C5.2, C11.10: the retour's tab, the focus on Zoé's first free seat, nothing written; Enter places Léa", async ({ db, page, seededEvent }) => {
    const scene = await seedScene(db, seededEvent.id, token, cars);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await placeTom(page);
    const record = await recordBar(page);
    // Every request that carries Léa, in the order it left.
    const writes: string[] = [];
    page.on("request", (request) => void (request.postData()?.includes(scene.lea) && writes.push(request.postData() ?? "")));

    await findSeat(page);
    await expect(seat(page, "Zoé")).toBeFocused();
    // Nothing written, nothing placed, and the bar untouched (v4.2.2-5).
    expect(await placements(db, seededEvent.id, scene.lea)).toEqual({ retour: null });
    await expect(cell(page, "Léa", "Retour")).toHaveAccessibleName("Léa, Retour : Sans voiture");
    await expect(messages(page)).toHaveText([TOM_PLACED]);
    expect((await record()).writes).toEqual([]);

    // Léa is the only person of the device without a car on the retour: one key, no sheet (C5.2).
    await page.keyboard.press("Enter");
    await expect(messages(page)).toHaveText(["Léa est dans la voiture de Zoé"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(cell(page, "Léa", "Retour")).toHaveAccessibleName("Léa, Retour : Avec Zoé");
    // Léa's seat, a later request known to carry her, is the only one that did: « Trouver une
    // place » sent nothing, neither before it nor late (Next sends one server action at a time).
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain(scene.rides["Zoé"]);
    expect(await placements(db, seededEvent.id, scene.lea)).toEqual({ retour: scene.rides["Zoé"] });
  });

  test("rule 4: Tom's tap, sent before the information and answered after it, leaves it (#339)", async ({ db, page, seededEvent }) => {
    const scene = await seedScene(db, seededEvent.id, token, [{ driver: "Marc", time: "17:00:00", free: 0 }]);
    await holdToken(page, seededEvent.id, token);
    const answer = await holdFirst(page, scene.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Sophie").click();

    await findSeat(page);
    await expect(messages(page)).toHaveText([NO_SEAT]);
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(scene.sophie));
    answer();
    await answered;
    // Tom's success comes under the information, which stays: his action began before it.
    await expect(messages(page)).toHaveText([NO_SEAT, TOM_PLACED]);
    await expect(barStatus(page)).toHaveText(TOM_PLACED);
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Avec Sophie");
    await expect(messages(page)).toHaveText([NO_SEAT, TOM_PLACED]);
  });

  test("C3.8, C5.5, C6.1: with two persons without a car, Enter on the seat opens the sheet, both checked", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token, cars, true);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);

    await findSeat(page);
    await expect(seat(page, "Zoé")).toBeFocused();
    await page.keyboard.press("Enter");
    const seats = sheet(page, "Qui monte dans la voiture de Zoé ?");
    await expect(seats).toBeVisible();
    await expect(seats.getByRole("checkbox", { name: "Tom" })).toBeChecked();
    await expect(seats.getByRole("checkbox", { name: "Léa" })).toBeChecked();
  });

  test("C3.8, C9.7, C11.10, C11.12: no free seat: the information over Tom's success, the focus on « Proposer une voiture »; a failure takes it away", async ({ db, page, seededEvent }) => {
    const scene = await seedScene(db, seededEvent.id, token, [{ driver: "Marc", time: "17:00:00", free: 0 }]);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await placeTom(page);
    const record = await recordBar(page);

    await findSeat(page);
    await expect(offer(page)).toBeFocused();
    await expect(offer(page)).toHaveAttribute("data-variant", "default");
    // An information, under the failures and above the success, which stays (rule 4).
    await expect(messages(page)).toHaveText([NO_SEAT, TOM_PLACED]);
    await expect(barStatus(page)).toHaveText(NO_SEAT);
    expect(said((await record()).writes, "status")).toEqual([NO_SEAT]);
    expect(said((await record()).writes, "alert")).toEqual([]);
    // Written once the sheet no longer hides the page.
    expect((await record()).writes.filter((write) => write.hidden)).toEqual([]);

    // The next action ends, here in a failure in the bar: the information goes, the success stays.
    const answer = await holdFirst(page, scene.lea, true);
    await cell(page, "Léa", "Retour").click();
    await sheet(page, "Léa · Retour").getByRole("button", { name: "Ne fait pas le retour" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await failHeld(page, answer);
    await expect(messages(page)).toHaveText([LEA_FAILED, TOM_PLACED]);
    await expect(barStatus(page)).toBeEmpty();
    await expect(bar(page)).toHaveText(LEA_FAILED);
    const { writes } = await record();
    // The failure empties the region `status`, and writes no text there.
    expect(said(writes, "status")).toEqual([NO_SEAT]);
    expect(writes.filter((write) => write.region === "status").at(-1)?.text).toBe("");
    expect(said(writes, "alert")).toEqual([LEA_FAILED]);
  });

  test("rule 8: « Fermer » on the information gives the focus to « Proposer une voiture » of the retour", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token, []);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);

    await findSeat(page);
    await expect(messages(page)).toHaveText([NO_SEAT]);
    await expect(offer(page)).toBeFocused();
    await barClose(page).click();
    await expect(messages(page)).toHaveCount(0);
    await expect(offer(page)).toBeFocused();
  });

  test("C11.4: with 15 cars, the seat found is in view, above the bar", async ({ db, page, seededEvent }) => {
    // Fourteen full cars leave first; the last one has one free seat, at the bottom of its card.
    const many = Array.from({ length: 15 }, (_, index) => ({
      driver: `Conducteur ${index + 1}`,
      time: `${String(8 + index).padStart(2, "0")}:00:00`,
      free: index === 14 ? 1 : 0,
    }));
    await seedScene(db, seededEvent.id, token, many);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await placeTom(page);

    await findSeat(page);
    const target = seat(page, "Conducteur 15");
    await expect(target).toBeFocused();
    await expect(target).toBeInViewport({ ratio: 1 });
    const seatBox = (await target.boundingBox())!;
    const barBox = (await page.locator("[data-message-bar]").boundingBox())!;
    expect(seatBox.y + seatBox.height).toBeLessThanOrEqual(barBox.y);
    await expect(messages(page)).toHaveText([TOM_PLACED]);
  });
});
