import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { holdFirst, holdToken, messages, newToken, recordBar, said } from "./device";
import { DRIVER_PHONE } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #359 (event-board v4.4.5, H5, S1.1 to S1.5): a placement's success held under a sheet is never
// written once a send made after it has succeeded in changing one of its persons on its leg.

type Db = Kysely<Database>;

/**
 * On the device, Marc, Tom and Léa. Marc and Tom, who drive in « Proposer une voiture », have a
 * number. Tom and Léa are without a car on both legs, Marc is not concerned on either. Sophie,
 * of another device, drives nobody at the aller (3 seats).
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const mine = async (firstName: string, phone: string | null = null) => (await seedPerson(db, eventId, { firstName, phone }, token)).id;
  const persons = { marc: await mine("Marc", DRIVER_PHONE), tom: await mine("Tom", DRIVER_PHONE), lea: await mine("Léa") };
  const sophie = await seedRide(db, eventId, (await seedPerson(db, eventId, { firstName: "Sophie" })).id);
  for (const personId of [persons.tom, persons.lea]) {
    for (const leg of ["aller", "retour"] as const) await seedPlacement(db, { personId, eventId, leg, rideId: null });
  }
  return { persons, sophie };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

const panel = (page: Page) => page.getByRole("tabpanel");
const card = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const cell = (page: Page, firstName: string, leg: "Aller" | "Retour") =>
  section(page).getByRole("button", { name: new RegExp(`^${firstName}, ${leg} : `) });
const cellSheet = (page: Page, firstName: string, leg: "Aller" | "Retour") => page.getByRole("dialog", { name: `${firstName} · ${leg}` });
/** The bar's lines and its buttons, by their CSS: an open sheet hides them from role queries. */
const lines = (page: Page) => page.locator('[data-message-bar] [role="group"] > p');
const barButtons = (page: Page) => page.locator("[data-message-bar]").getByRole("button");

/** Where `personId` is on `leg`: a Ride, `null` without a car, `undefined` not concerned. */
const where = async (db: Db, personId: string, leg: Leg) =>
  (await db.selectFrom("placement").select("ride_id").where("person_id", "=", personId).where("leg", "=", leg).executeTakeFirst())?.ride_id;

/** The answer to the first server action whose body carries `marker`, once it reaches the page. */
const answerOf = (page: Page, marker: string) => page.waitForResponse((response) => !!response.request().postData()?.includes(marker));

/** A tap on a free seat of `driver`'s car opens the sheet; exactly `names` ticked, sent, then Escape before the answer. */
async function placeThenClose(page: Page, driver: string, names: string[]) {
  await card(page, driver).getByRole("button", { name: /^Place libre/ }).first().click();
  const sheet = page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });
  for (const name of ["Marc", "Tom", "Léa"]) {
    const box = sheet.getByRole("checkbox", { name, exact: true });
    if ((await box.count()) > 0) await box.setChecked(names.includes(name));
  }
  await sheet.getByRole("button", { name: /^Placer/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** After the last sheet closed: 1 s on the page's clock, so that nothing the bar would still write waits. */
async function settle(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.clock.runFor(1_000);
}

test.describe("H5: a held placement's success, made untrue since", () => {
  test.use({ locale: "fr-FR" });
  const token = newToken();
  let scene: Scene;

  test.beforeEach(async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.clock.install();
  });

  test("S1.1: « Proposer une voiture » with Tom, then « Sortir de la voiture » for Tom: the bar says nothing", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const answer = await holdFirst(page, "Mairie de Vitré", false);
    await page.goto(`/e/${id}`);
    await panel(page).getByRole("button", { name: "Proposer une voiture", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Proposer une voiture" });
    await form.getByRole("radiogroup", { name: "Qui conduit ?" }).getByRole("radio", { name: "Marc", exact: true }).check();
    await form.getByLabel("Lieu de départ", { exact: true }).fill("Mairie de Vitré");
    await form.getByLabel("Places, sans compter qui conduit", { exact: true }).fill("3");
    await form.getByRole("group", { name: "Qui monte avec vous ?" }).getByRole("checkbox", { name: "Tom", exact: true }).check();
    const record = await recordBar(page);
    await form.getByRole("button", { name: "Valider" }).click();
    await expect(form.getByRole("button", { name: "Valider" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);

    await cell(page, "Tom", "Aller").click();
    answer();
    const leave = cellSheet(page, "Tom", "Aller").getByRole("button", { name: "Sortir de la voiture" });
    await expect(leave).toBeVisible();
    await leave.click();
    await settle(page);

    await expect(lines(page)).toHaveCount(0);
    await expect(barButtons(page).filter({ hasText: "Annuler" })).toHaveCount(0);
    await expect(cell(page, "Tom", "Aller")).toBeFocused();
    await expect(cell(page, "Tom", "Aller")).toHaveAccessibleName("Tom, Aller : Sans voiture");
    expect(said((await record()).writes, "status")).not.toContain("Tom est dans la voiture de Marc");
    const cars = await db.selectFrom("ride").select("id").where("event_id", "=", id).where("driver_id", "=", scene.persons.marc).where("leg", "=", "aller").execute();
    expect(cars.length).toBe(1);
    expect(await where(db, scene.persons.tom, "aller")).toBeNull();
  });

  test("S1.2: the seat sheet with Tom and Léa, then « Sortir de la voiture » for Tom alone: the whole success goes", async ({ db, page, seededEvent }) => {
    const answer = await holdFirst(page, scene.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    const record = await recordBar(page);
    await placeThenClose(page, "Sophie", ["Tom", "Léa"]);

    await cell(page, "Tom", "Aller").click();
    answer();
    const leave = cellSheet(page, "Tom", "Aller").getByRole("button", { name: "Sortir de la voiture" });
    await expect(leave).toBeVisible();
    await leave.click();
    await settle(page);

    await expect(lines(page)).toHaveCount(0);
    await expect(barButtons(page).filter({ hasText: "Annuler" })).toHaveCount(0);
    expect(said((await record()).writes, "status")).not.toContain("Tom et Léa sont dans la voiture de Sophie");
    expect(await where(db, scene.persons.tom, "aller")).toBeNull();
    expect(await where(db, scene.persons.lea, "aller")).toBe(scene.sophie);
    await expect(cell(page, "Léa", "Aller")).toHaveAccessibleName("Léa, Aller : Avec Sophie");
  });

  test("S1.3: Tom placed, then « Qui sort de la voiture ? » takes him out: the bar says nothing, « Modifier » has the focus", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marcsCar = await seedRide(db, id, scene.persons.marc, { seats: 2 });
    const nina = (await seedPerson(db, id, { firstName: "Nina" })).id;
    await seedPlacement(db, { personId: nina, eventId: id, leg: "aller", rideId: marcsCar });
    const answer = await holdFirst(page, marcsCar, false);
    await page.goto(`/e/${id}`);
    const record = await recordBar(page);
    await placeThenClose(page, "Marc", ["Tom"]);

    const edit = card(page, "Marc").getByRole("button", { name: "Modifier", exact: true });
    await edit.click();
    const form = page.getByRole("dialog", { name: "Modifier la voiture", exact: true });
    const answered = answerOf(page, marcsCar);
    answer();
    await answered;
    await form.getByLabel("Places, sans compter qui conduit").fill("1");
    await form.getByRole("button", { name: "Valider" }).click();
    const step = page.getByRole("dialog", { name: "Qui sort de la voiture ?", exact: true });
    await expect(step.getByRole("checkbox")).toHaveCount(2);
    for (const name of ["Nina", "Tom"]) await expect(step.getByRole("checkbox", { name })).toBeVisible();
    await step.getByRole("checkbox", { name: "Tom" }).check();
    await step.getByRole("button", { name: "Valider" }).click();
    await settle(page);

    await expect(lines(page)).toHaveCount(0);
    await expect(edit).toBeFocused();
    expect(said((await record()).writes, "status")).not.toContain("Tom est dans la voiture de Marc");
    expect(await where(db, scene.persons.tom, "aller")).toBeNull();
    expect(await where(db, nina, "aller")).toBe(marcsCar);
    expect((await db.selectFrom("ride").select("seats").where("id", "=", marcsCar).executeTakeFirstOrThrow()).seats).toBe(1);
  });

  test("rule 2, v4.4.5, item 1: Tom placed, then « Proposer une voiture » with Tom driving: he leaves Sophie's car, and the bar says nothing", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const answer = await holdFirst(page, scene.sophie, false);
    await page.goto(`/e/${id}`);
    const record = await recordBar(page);
    await placeThenClose(page, "Sophie", ["Tom"]);

    await panel(page).getByRole("button", { name: "Proposer une voiture", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Proposer une voiture" });
    const answered = answerOf(page, scene.sophie);
    answer();
    await answered;
    await form.getByRole("radiogroup", { name: "Qui conduit ?" }).getByRole("radio", { name: "Tom", exact: true }).check();
    await form.getByLabel("Lieu de départ", { exact: true }).fill("Mairie de Vitré");
    await form.getByRole("button", { name: "Valider" }).click();
    await settle(page);

    await expect(lines(page)).toHaveCount(0);
    await expect(barButtons(page).filter({ hasText: "Annuler" })).toHaveCount(0);
    expect(said((await record()).writes, "status")).not.toContain("Tom est dans la voiture de Sophie");
    const cars = await db.selectFrom("ride").select("id").where("event_id", "=", id).where("driver_id", "=", scene.persons.tom).where("leg", "=", "aller").execute();
    expect(cars.length).toBe(1);
    expect(await where(db, scene.persons.tom, "aller")).toBeUndefined();
  });

  test("S1.4: Tom placed, then « Sortir de la voiture » offline: the success and its « Annuler », once closed", async ({ context, db, page, seededEvent }) => {
    const answer = await holdFirst(page, scene.sophie, false);
    await page.goto(`/e/${seededEvent.id}`);
    await placeThenClose(page, "Sophie", ["Tom"]);

    await cell(page, "Tom", "Aller").click();
    const sheet = cellSheet(page, "Tom", "Aller");
    answer();
    const leave = sheet.getByRole("button", { name: "Sortir de la voiture" });
    await expect(leave).toBeVisible();
    await context.setOffline(true);
    await leave.click();
    await expect(sheet.getByRole("alert")).not.toBeEmpty();
    await page.keyboard.press("Escape");
    await settle(page);
    await context.setOffline(false);

    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sophie"]);
    await expect(barButtons(page)).toHaveCount(2);
    await expect(barButtons(page).nth(0)).toHaveAccessibleName("Annuler");
    await expect(barButtons(page).nth(1)).toHaveAccessibleName("Fermer");
    expect(await where(db, scene.persons.tom, "aller")).toBe(scene.sophie);
  });

  for (const [who, leg, button] of [
    ["Léa", "Aller", "Ne fait pas l’aller"],
    ["Tom", "Retour", "Ne fait pas le retour"],
  ] as const) {
    test(`S1.5: Tom placed, then ${who} · ${leg}, « ${button} »: the success and its « Annuler », once closed`, async ({ page, seededEvent }) => {
      const answer = await holdFirst(page, scene.sophie, false);
      await page.goto(`/e/${seededEvent.id}`);
      await placeThenClose(page, "Sophie", ["Tom"]);

      await cell(page, who, leg).click();
      const answered = answerOf(page, scene.sophie);
      answer();
      await answered;
      await cellSheet(page, who, leg).getByRole("button", { name: button }).click();
      await settle(page);

      await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sophie"]);
      await expect(barButtons(page)).toHaveCount(2);
      await expect(barButtons(page).nth(0)).toHaveAccessibleName("Annuler");
      await expect(barButtons(page).nth(1)).toHaveAccessibleName("Fermer");
    });
  }
});
