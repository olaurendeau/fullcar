import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failHeld, holdFirst, holdToken, messages, newToken, recordBar, said, watchAlerts } from "./device";
import { removeRetourInDb } from "./event-db";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #172: « Trouver une place », the first action of a cell « Sans voiture » (C3.8, v4-6). It
// places nobody: the leg's tab active, the focus on the first free seat of the first car that has one.

type Db = Kysely<Database>;

const TOM_PLACED = "Tom est dans la voiture de Sophie";
const NO_SEAT = "Aucune place libre au retour pour l’instant.";
const LEA_FAILED = "Léa · Retour : « Ne fait pas le retour » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant.";
const HUGO_FAILED = "Hugo n’a pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant.";
/** Tom's « Je cherche une place » on the retour, refused once the organiser has removed it (#330, rule 9). */
const TOM_NO_RETOUR = "Tom · Retour : « Je cherche une place » n’a pas été enregistré. Il n’y a plus de retour pour cet événement.";

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
    // A boolean each, whether it carries Zoé's car: a body holds the device's token, never kept nor shown (#364, #365).
    const writes: boolean[] = [];
    page.on("request", (request) => {
      const body = request.postData() ?? "";
      if (body.includes(scene.lea)) writes.push(body.includes(scene.rides["Zoé"]));
    });

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
    expect(writes.length, "requests carrying Léa").toBe(1);
    expect(writes[0], "Léa's request carries Zoé's car").toBe(true);
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
  });

  // Rule 8 after #340 (review of #339): a late success replaces Tom's, whose « Annuler » has the
  // focus, while a more recent information stays. The focus goes to the landmark of Tom's line,
  // his car's title, not to the information's, « Proposer une voiture » of the same leg.
  test("rule 8: a late success replaces Tom's while his « Annuler » has the focus; the information stays, the focus goes to Sophie's title", async ({ db, page, seededEvent }) => {
    const eventId = seededEvent.id;
    const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
    const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
    const [tom, lea, hugo] = [await mine("Tom"), await mine("Léa"), await mine("Hugo")];
    await seedRide(db, eventId, await other("Sophie"), { seats: 1 });
    await seedRide(db, eventId, await other("Paul"), { leg: "retour" });
    await seedPlacement(db, { personId: tom, eventId, leg: "aller", rideId: null });
    await seedPlacement(db, { personId: hugo, eventId, leg: "retour", rideId: null });
    await holdToken(page, eventId, token);
    await page.goto(`/e/${eventId}`);
    await expect(seat(page, "Sophie")).toBeEnabled();
    // Léa looks for a seat on the aller once the page is shown: Tom is still the only one there, and his tap places him.
    await seedPlacement(db, { personId: lea, eventId, leg: "aller", rideId: null });
    await seat(page, "Sophie").click();
    await expect(messages(page)).toHaveText([TOM_PLACED]);
    await expect(cell(page, "Léa", "Aller")).toHaveAccessibleName("Léa, Aller : Sans voiture");

    // Hugo's tap on the retour, held: it began before the information.
    const answer = await holdFirst(page, hugo, false);
    await tab(page, "Retour").click();
    await seat(page, "Paul").click();
    // « Trouver une place » for Léa: Sophie's car is full, no free seat on the aller.
    await cell(page, "Léa", "Aller").click();
    await sheet(page, "Léa · Aller").getByRole("button", { name: "Trouver une place" }).click();
    await expect(tab(page, "Aller")).toHaveAttribute("aria-selected", "true");
    await expect(messages(page)).toHaveText(["Aucune place libre à l’aller pour l’instant.", TOM_PLACED]);
    await expect(offer(page)).toBeFocused();

    const undo = page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" });
    await undo.focus();
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(hugo));
    answer();
    await answered;
    await expect(messages(page)).toHaveText(["Aucune place libre à l’aller pour l’instant.", "Hugo est dans la voiture de Paul"]);
    await expect(page.getByRole("heading", { name: "Voiture de Sophie" })).toBeFocused();
    await expect(offer(page)).not.toBeFocused();
  });

  // C11.12 (v4.4.3): the region `status` empties only while it still says the information.
  test("C11.12: Hugo's tap fails within 100 ms of Tom's success: the information goes, `status` says Tom's success and is never emptied after", async ({ db, page, seededEvent }) => {
    const scene = await seedScene(db, seededEvent.id, token, [{ driver: "Marc", time: "17:00:00", free: 0 }]);
    const hugo = (await seedPerson(db, seededEvent.id, { firstName: "Hugo" }, token)).id;
    await holdToken(page, seededEvent.id, token);
    await page.clock.install();
    const tom = await holdFirst(page, scene.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Sophie").click();
    await findSeat(page);
    await expect(barStatus(page)).toHaveText(NO_SEAT);
    // Back to Sophie's car, on the aller: a tab is no action.
    await tab(page, "Aller").click();
    await expect(tab(page, "Aller")).toHaveAttribute("aria-selected", "true");

    // Hugo, not concerned so far, looks for a seat on the aller: the answer to Tom's tap shows it.
    await seedPlacement(db, { personId: hugo, eventId: seededEvent.id, leg: "aller", rideId: null });
    const record = await recordBar(page);
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(scene.tom));
    tom();
    await answered;
    await expect(messages(page)).toHaveText([NO_SEAT, TOM_PLACED]);
    // Tom's success is written in `status` 100 ms after the region empties.
    await expect(barStatus(page)).toBeEmpty();
    await expect(cell(page, "Hugo", "Aller")).toHaveAccessibleName("Hugo, Aller : Sans voiture");

    // Begun after the information, Hugo's tap fails before those 100 ms, and removes it. From the
    // keyboard: the clock paused, a click would wait for the seat to be stable.
    const failing = await holdFirst(page, hugo, true);
    await seat(page, "Sophie").focus();
    await page.keyboard.press("Enter");
    await failHeld(page, failing);
    await expect(messages(page)).toHaveText([HUGO_FAILED, TOM_PLACED]);
    await page.clock.runFor(100);
    // The write due was not cancelled.
    await expect(barStatus(page)).toHaveText(TOM_PLACED);
    await expect(bar(page)).toHaveText(HUGO_FAILED);
    await page.clock.runFor(1_000);
    await expect(barStatus(page)).toHaveText(TOM_PLACED);
    const { writes } = await record();
    // Emptied once, as Tom's success is written, and never again.
    expect(writes.filter((write) => write.region === "status").map((write) => write.text)).toEqual(["", TOM_PLACED]);
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

  // Review of #339: #330 keeps the retour shown under an open sheet until it closes. Tom's change,
  // sent before the organiser removed the retour, is refused while Léa's sheet is open; Léa then
  // finds a seat on that retour. Its failure is said once the sheet closes, the information of a
  // retour gone never is, and the focus goes to the event's title, never <body>.
  for (const free of [1, 0]) {
    test(`#330: « Trouver une place » on the retour while it goes, ${free ? "a free seat" : "no free seat"}: Tom's failure in the bar, the focus on the title`, async ({ db, page, seededEvent }) => {
      const scene = await seedScene(db, seededEvent.id, token, [{ driver: "Marc", time: "17:00:00", free }]);
      await holdToken(page, seededEvent.id, token);
      await page.goto(`/e/${seededEvent.id}`);
      const seen = await watchAlerts(page);
      const answer = await holdFirst(page, scene.tom, false);
      await cell(page, "Tom", "Retour").click();
      await sheet(page, "Tom · Retour").getByRole("button", { name: "Je cherche une place" }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await cell(page, "Léa", "Retour").click();
      await removeRetourInDb(db, seededEvent.id);
      const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(scene.tom));
      answer();
      await answered;
      // The retour stays behind Léa's sheet, and Tom's failure waits for it to close.
      await expect(page.locator('[role="tab"]')).toHaveCount(2);
      await expect(page.locator('[data-message-bar] [role="group"] > p')).toHaveCount(0);

      await sheet(page, "Léa · Retour").getByRole("button", { name: "Trouver une place" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // Gone once Radix has given the focus back and the page has taken the state without the retour.
      await expect(page.locator('[role="tab"]')).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      await expect(messages(page)).toHaveText([TOM_NO_RETOUR]);
      await expect(bar(page)).toHaveText(TOM_NO_RETOUR);
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    });
  }

  // B1.6 (event-board v4.4.4, #267): the retour's information goes with the state without the
  // retour, whatever the answer that brings it and whenever its action began; `status` no longer
  // says it, and a write of it still due is cancelled. The aller's information stays.
  const taken = async (db: Db, eventId: string, rideId: string) => {
    for (const firstName of ["Ana", "Bob", "Cyd"]) await seedPlacement(db, { personId: (await seedPerson(db, eventId, { firstName })).id, eventId, leg: "aller", rideId });
  };

  test("B1.6: Tom's tap, sent before the information of the retour, succeeds with the state without it: the information goes", async ({ db, page, seededEvent }) => {
    const scene = await seedScene(db, seededEvent.id, token, [{ driver: "Marc", time: "17:00:00", free: 0 }]);
    await holdToken(page, seededEvent.id, token);
    const tom = await holdFirst(page, scene.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Sophie").click();
    await removeRetourInDb(db, seededEvent.id);
    await findSeat(page);
    await expect(barStatus(page)).toHaveText(NO_SEAT);
    const record = await recordBar(page);
    tom();

    await expect(messages(page)).toHaveText([TOM_PLACED]);
    await expect(page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" })).toHaveAccessibleDescription(TOM_PLACED);
    await expect(barStatus(page)).toHaveText(TOM_PLACED);
    const status = (await record()).writes.filter((write) => write.region === "status");
    expect(status[0]?.text).toBe("");
    expect(said(status, "status")).toEqual([TOM_PLACED]);
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toBeFocused();
  });

  test("B1.6: Tom's tap refused within 100 ms of the information of the retour, with the state without it: `status` never says it", async ({
    db,
    page,
    seededEvent,
  }) => {
    const scene = await seedScene(db, seededEvent.id, token, [{ driver: "Marc", time: "17:00:00", free: 0 }]);
    await holdToken(page, seededEvent.id, token);
    await page.clock.install();
    const tom = await holdFirst(page, scene.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Sophie").click();
    await removeRetourInDb(db, seededEvent.id);
    await taken(db, seededEvent.id, scene.sophie);
    await cell(page, "Léa", "Retour").click();
    const record = await recordBar(page);
    // The clock paused, the information's write in `status` stays due. From the keyboard: a click would wait for a stable frame.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    await sheet(page, "Léa · Retour").getByRole("button", { name: "Trouver une place" }).focus();
    await page.keyboard.press("Enter");
    await expect(messages(page)).toHaveText([NO_SEAT]);
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(scene.sophie));
    tom();
    await answered;

    const refused = "Tom n’a pas pu monter dans la voiture de Sophie. Cette place vient d’être prise.";
    await expect(messages(page)).toHaveText([refused]);
    await page.clock.runFor(100);
    await expect(bar(page)).toHaveText(refused);
    await page.clock.runFor(1_000);
    await expect(barStatus(page)).toBeEmpty();
    expect(said((await record()).writes, "status")).toEqual([]);
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toBeFocused();
  });

  test("B1.6, on the aller: Tom's change, sent before the information of the aller, leaves it with the state without the retour", async ({
    db,
    page,
    seededEvent,
  }) => {
    const scene = await seedScene(db, seededEvent.id, token, []);
    await seedPlacement(db, { personId: scene.lea, eventId: seededEvent.id, leg: "aller", rideId: null });
    await taken(db, seededEvent.id, scene.sophie);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const answer = await holdFirst(page, scene.tom, false);
    await cell(page, "Tom", "Aller").click();
    await sheet(page, "Tom · Aller").getByRole("button", { name: "Ne fait pas l’aller" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await removeRetourInDb(db, seededEvent.id);
    await cell(page, "Léa", "Aller").click();
    await sheet(page, "Léa · Aller").getByRole("button", { name: "Trouver une place" }).click();
    const allerNoSeat = "Aucune place libre à l’aller pour l’instant.";
    await expect(messages(page)).toHaveText([allerNoSeat]);
    const answered = page.waitForResponse((response) => !!response.request().postData()?.includes(scene.tom));
    answer();
    await answered;

    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Ne fait pas l’aller");
    await expect(messages(page)).toHaveText([allerNoSeat]);
  });
});
