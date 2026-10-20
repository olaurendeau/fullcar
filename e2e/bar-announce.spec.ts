import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { bar, failActions, failHeld, holdFirst, holdToken, messages, newToken, recordBar, said } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #222: two hidden regions announce only the bar's new message (« Lecteurs d’écran », v4.2.2, C11.12).

// A failure of the seat sheet names who could not get in (C11.11, #223).
const FAILED = "Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant.";
/** « Réessayer » offline names what was not loaded (C11.11, #225). */
const OFFLINE = "Vos inscriptions n’ont pas pu être chargées. Vérifiez la connexion, puis réessayez.";
const HUGO = "Hugo est dans la voiture de Marc";

/** The device holds Tom, Léa and Hugo. Aller: Sophie and Marc drive nobody; Tom and Léa are without a car. */
async function seedScene(db: Kysely<Database>, eventId: string, token: string) {
  const mine = async (firstName: string) => (await seedPerson(db, eventId, { firstName }, token)).id;
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const persons = { tom: await mine("Tom"), lea: await mine("Léa"), hugo: await mine("Hugo") };
  const cars = {
    sophie: await seedRide(db, eventId, await other("Sophie")),
    marc: await seedRide(db, eventId, await other("Marc"), { departureTime: "07:30:00" }),
  };
  for (const personId of [persons.tom, persons.lea]) await seedPlacement(db, { personId, eventId, leg: "aller", rideId: null });
  return { persons, cars };
}

/** A car's title, found while a sheet hides the page from role queries. */
const carTitle = (page: Page, rideId: string) => page.locator(`[data-car-title="${rideId}"]`);
const title = (page: Page, driver: string) => page.getByRole("heading", { name: `Voiture de ${driver}` });
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
const barClose = (page: Page) => page.locator("[data-message-bar]").getByRole("button", { name: "Fermer" });
const seat = (page: Page, driver: string) => page.locator(`button[aria-label="Place libre : prendre une place dans la voiture de ${driver}"]`).first();
const sheet = (page: Page, driver: string) => page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });

/** Opens the sheet of `driver`'s car, by the keyboard: a sheet may hide the page from role queries. */
async function openSheet(page: Page, driver: string) {
  // Inactive until the device's persons are read (C5.9).
  await expect(seat(page, driver)).toBeEnabled();
  await seat(page, driver).focus();
  await page.keyboard.press("Enter");
  await expect(sheet(page, driver)).toBeVisible();
}

/** Opens the sheet of `driver`'s car, ticks or unticks `toggled`, sends it, and closes it before the answer. */
async function sendThenClose(page: Page, driver: string, toggled: string[] = []) {
  await openSheet(page, driver);
  for (const name of toggled) await sheet(page, driver).getByRole("checkbox", { name }).click();
  await sheet(page, driver).getByRole("button", { name: /^Placer/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Stops the page's clock: a timer of the page fires only as the test moves the clock on. */
const pauseClock = async (page: Page) => page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);

test.describe("the bar's live regions", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Awaited<ReturnType<typeof seedScene>>;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
  });

  test("C11.12: the visible list is no live region, and its icons are hidden", async ({ page, seededEvent }) => {
    const sophie = await holdFirst(page, scene.cars.sophie, true);
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page, "Sophie");
    await failHeld(page, sophie);
    const list = page.getByRole("group", { name: "Messages" });
    await expect(list.locator("p")).toHaveText([FAILED]);
    expect(await list.evaluate((group) => group.matches("[aria-live], [role=alert], [role=status]"))).toBe(false);
    await expect(list.locator("[aria-live], [role=alert], [role=status]")).toHaveCount(0);
    await expect(list.locator("svg:not([aria-hidden=true])")).toHaveCount(0);
    // Both regions come after « Fermer », so that the list is read first.
    await expect(page.locator('[data-message-bar] button[aria-label="Fermer"] ~ [role="status"] + [role="alert"]')).toHaveCount(1);
  });

  test("C11.12: after a failure, the region is empty at once, and holds its text 100 ms later", async ({ page, seededEvent }) => {
    await page.clock.install();
    const sophie = await holdFirst(page, scene.cars.sophie, true);
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page, "Sophie");
    await pauseClock(page);
    await failHeld(page, sophie);
    await expect(messages(page)).toHaveText([FAILED]);
    await expect(bar(page)).toBeEmpty();
    await page.clock.runFor(99);
    await expect(bar(page)).toBeEmpty();
    await page.clock.runFor(1);
    await expect(bar(page)).toHaveText(FAILED);
  });

  test("C11.12: « Fermer » before 100 ms: the region stays empty", async ({ page, seededEvent }) => {
    await page.clock.install();
    const sophie = await holdFirst(page, scene.cars.sophie, true);
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page, "Sophie");
    await pauseClock(page);
    const record = await recordBar(page);
    await failHeld(page, sophie);
    await expect(messages(page)).toHaveText([FAILED]);
    await barClose(page).click();
    await expect(messages(page)).toHaveCount(0);
    await page.clock.runFor(1_000);
    await expect(bar(page)).toBeEmpty();
    expect(said((await record()).writes, "alert")).toEqual([]);
  });

  test("C11.12: a sheet opened before the 100 ms: the text waits for it to close, never written under it", async ({ page, seededEvent }) => {
    await page.clock.install();
    const sophie = await holdFirst(page, scene.cars.sophie, true);
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page, "Sophie");
    const record = await recordBar(page);
    await pauseClock(page);
    await failHeld(page, sophie);
    await expect(messages(page)).toHaveText([FAILED]);
    await openSheet(page, "Marc");
    await page.clock.runFor(1_000);
    await expect(bar(page)).toBeEmpty();

    await page.clock.resume();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(bar(page)).toHaveText(FAILED);
    expect((await record()).writes).toEqual([{ region: "alert", text: FAILED, hidden: false }]);
  });

  // Two sheets closed, whose answers both come while a third one hides the page: written in one render.
  test("C11.12: two failures in the same render: the second alone is written; the first stays in the list", async ({ db, page, seededEvent }) => {
    const sophie = await holdFirst(page, scene.cars.sophie, true);
    const marc = await holdFirst(page, scene.cars.marc, false);
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page, "Sophie");
    await sendThenClose(page, "Marc");
    await db.deleteFrom("ride").where("id", "=", scene.cars.marc).execute();
    await openSheet(page, "Sophie");
    const record = await recordBar(page);
    await failHeld(page, sophie);
    marc();
    // Answered last, the refusal is taken once the page shows its state: the car gone, under the sheet.
    await expect(carTitle(page, scene.cars.marc)).toHaveCount(0);
    await page.keyboard.press("Escape");

    await expect(messages(page)).toHaveCount(2);
    const [newest, first] = await messages(page).allTextContents();
    expect(newest).not.toBe(first);
    await expect(bar(page)).toHaveText(newest);
    expect(said((await record()).writes, "alert")).toEqual([newest]);
  });

  // Answered with no request, the send withdraws its failure and the same failure comes back at once.
  test("C11.12: « Réessayer » offline again: the region empties, then holds the same text once more", async ({ context, page, seededEvent }) => {
    await page.clock.install();
    await failActions(page);
    await page.goto(`/e/${seededEvent.id}`);
    const retry = page.getByRole("button", { name: "Réessayer" });
    await context.setOffline(true);
    await retry.click();
    await expect(bar(page)).toHaveText(OFFLINE);
    await pauseClock(page);
    const record = await recordBar(page);

    await retry.click();
    await expect.poll(async () => (await record()).writes.length).toBe(1);
    await page.clock.runFor(99);
    await expect(bar(page)).toBeEmpty();
    await page.clock.runFor(1);
    await expect(bar(page)).toHaveText(OFFLINE);
    expect((await record()).writes.map(({ region, text }) => [region, text])).toEqual([
      ["alert", ""],
      ["alert", OFFLINE],
    ]);
  });

  // The case of #216, both answers released while a third sheet hides the page (rule 7): the
  // success comes first, and Sophie's car, removed meanwhile, refuses the seats.
  test("C11.12: a failure and a success released together: the failure is written first, each in its own region", async ({ db, page, seededEvent }) => {
    const marc = await holdFirst(page, scene.cars.marc, false);
    const sophie = await holdFirst(page, scene.cars.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    await sendThenClose(page, "Marc", ["Tom", "Léa", "Hugo"]);
    await sendThenClose(page, "Sophie");
    await db.deleteFrom("ride").where("id", "=", scene.cars.sophie).execute();
    await openSheet(page, "Marc");
    const record = await recordBar(page);
    marc();
    sophie();
    // Answered last, the refusal is taken once the page shows its state: the car gone, under the sheet.
    await expect(carTitle(page, scene.cars.sophie)).toHaveCount(0);
    await page.keyboard.press("Escape");

    await expect(messages(page)).toHaveCount(2);
    const [refused] = await messages(page).allTextContents();
    await expect(messages(page)).toHaveText([refused, HUGO]);
    await expect(bar(page)).toHaveText(refused);
    await expect(barStatus(page)).toHaveText(HUGO);
    // The failure first; a success never touches `alert`, a failure never `status`; none under the sheet.
    expect((await record()).writes).toEqual([
      { region: "alert", text: refused, hidden: false },
      { region: "status", text: HUGO, hidden: false },
    ]);

    // Written first, the failure is the older line: « Fermer » gives the focus to the success's landmark.
    await barClose(page).click();
    await expect(title(page, "Marc")).toBeFocused();
  });
});
