import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide, seedStop } from "@/db/test-participants";
import { contrast } from "./contrast";
import { failHeld, holdFirst, holdToken, loseFirst, messages, newToken } from "./device";
import { DRIVER_PHONE, numbersHidden } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #892, epic #881: « Changer le point » on the passengers of the device (RV4.1), the sheet « Où
// monte {prénom} ? » (RV4.2, RV4.3, RV4.4, RV7.1, RV7.2) and « monte à {lieu} » that follows a point
// whose place or time the driver changes (RV6.2). Every assertion that reads a card goes through
// `numbersHidden`: a card holds `tel:` links.

type Db = Kysely<Database>;

const PRELLES = "Prelles boucherie";
const BRIANCON = "Briançon carrefour";
const MONETIER = "Monétier";
const START = "Champcella";
const START_CHOICE = `${START} · 08:00 · Lieu de départ`;

/**
 * Aller. Nina (4 seats, 08:00, from Champcella) has three points: Prelles 08:25, Briançon 08:35 and
 * Monétier 08:50. Paul, of another device, boards at Prelles. The device holds Tom (at Prelles) and
 * Léa (at the departure) in her car, and Ava in Sam's (2 seats, 09:00, no point).
 */
async function seedScene(db: Db, eventId: string, token: string) {
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName, phone: DRIVER_PHONE })).id;
  const nina = await seedRide(db, eventId, await other("Nina"), { departureTime: "08:00:00", seats: 4, location: START });
  const sam = await seedRide(db, eventId, await other("Sam"), { departureTime: "09:00:00", seats: 2, location: "Valence" });
  const stops = {
    prelles: await seedStop(db, eventId, nina, { location: PRELLES, time: "08:25:00" }),
    briancon: await seedStop(db, eventId, nina, { location: BRIANCON, time: "08:35:00" }),
    monetier: await seedStop(db, eventId, nina, { location: MONETIER, time: "08:50:00" }),
  };
  await seedPlacement(db, { personId: await other("Paul"), eventId, leg: "aller", rideId: nina, stopId: stops.prelles });
  const persons: Record<string, string> = {};
  for (const [firstName, rideId, stopId] of [["Tom", nina, stops.prelles], ["Léa", nina, null], ["Ava", sam, null]] as const) {
    persons[firstName] = (await seedPerson(db, eventId, { firstName }, token)).id;
    await seedPlacement(db, { personId: persons[firstName], eventId, leg: "aller", rideId, stopId });
  }
  return { cars: { nina, sam }, stops, persons };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

/** A person's Placement on the aller: its Ride and its Stop. */
async function placementOf(db: Db, eventId: string, personId: string) {
  const row = await db.selectFrom("placement").select(["ride_id", "stop_id"]).where("event_id", "=", eventId).where("person_id", "=", personId).where("leg", "=", "aller").executeTakeFirstOrThrow();
  return { rideId: row.ride_id, stopId: row.stop_id };
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const line = (page: Page, driver: string, firstName: string) => car(page, driver).getByRole("list", { name: "Places" }).getByRole("listitem").filter({ hasText: firstName });
const changeName = (firstName: string) => `Changer le point de montée de ${firstName}`;
const changeButton = (page: Page, driver: string, firstName: string) => car(page, driver).getByRole("button", { name: changeName(firstName) });
const sheet = (page: Page, firstName: string) => page.getByRole("dialog", { name: `Où monte ${firstName} ?` });
const group = (dialog: Locator) => dialog.getByRole("radiogroup", { name: "Point de montée" });
const choice = (dialog: Locator, name: string | RegExp) => group(dialog).getByRole("radio", { name });
const validate = (dialog: Locator) => dialog.getByRole("button", { name: "Valider", exact: true });
const cancel = (dialog: Locator) => dialog.getByRole("button", { name: "Annuler", exact: true });
const bar = (page: Page) => page.locator("[data-message-bar]");
const alerts = (scope: Locator) => scope.getByRole("alert").filter({ hasText: /\S/ });

/** The server actions the page sends from now on about `marker` (the car's id). */
function actions(page: Page, marker: string): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    const body = request.headers()["next-action"] && request.postData();
    if (body && body.includes(marker)) sent.push(body);
  });
  return sent;
}

test.describe("« Changer le point »", () => {
  test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });
  const token = newToken();
  let scene: Scene;

  async function visit(page: Page, db: Db, eventId: string) {
    scene = await seedScene(db, eventId, token);
    await holdToken(page, eventId, token);
    await page.goto(`/e/${eventId}`);
  }

  /** Tom's sheet, open. */
  async function openTom(page: Page) {
    await changeButton(page, "Nina", "Tom").click();
    const dialog = sheet(page, "Tom");
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("RV4.1: each passenger of the device of a car with points has « Changer le point » and says where she boards; the others have neither button", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    await numbersHidden(async () => {
      await expect(line(page, "Nina", "Tom")).toContainText(`monte à ${PRELLES}`);
      await expect(line(page, "Nina", "Léa")).toContainText("monte au départ");
      await expect(changeButton(page, "Nina", "Tom")).toHaveText("Changer le point");
      await expect(changeButton(page, "Nina", "Léa")).toHaveText("Changer le point");
      // Paul is of another device: where he boards is shown, and nothing to change.
      await expect(line(page, "Nina", "Paul")).toContainText(`monte à ${PRELLES}`);
      await expect(line(page, "Nina", "Paul").getByRole("button")).toHaveCount(0);
      await expect(car(page, "Nina").getByRole("button", { name: /^Changer le point/ })).toHaveCount(2);
      // Ava is of the device, but Sam's car has no point: no button, nothing said of where she boards.
      await expect(line(page, "Sam", "Ava")).toBeVisible();
      await expect(car(page, "Sam").getByRole("button", { name: /^Changer le point/ })).toHaveCount(0);
      await expect(line(page, "Sam", "Ava")).not.toContainText("monte");
      expect((await changeButton(page, "Nina", "Tom").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });
  });

  test("RV4.2, RV4.4: the choice of now ticked and focused; « Valider » saves, the bar says it, « Annuler » gives the point before back; the seat and the coverage do not move", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const free = car(page, "Nina").getByRole("button", { name: /^Place libre/ });
    await expect(free).toHaveCount(1);
    const placedAt = () => db.selectFrom("placement").select(["person_id", "ride_id", "placed_at"]).where("event_id", "=", seededEvent.id).orderBy("person_id").execute();
    const before = await placedAt();
    const dialog = await openTom(page);
    await expect(group(dialog).locator("label")).toHaveText([START_CHOICE, `${PRELLES} · 08:25`, `${BRIANCON} · 08:35`, `${MONETIER} · 08:50`]);
    await expect(choice(dialog, /Prelles/)).toBeChecked();
    await expect(choice(dialog, /Prelles/)).toBeFocused();
    await choice(dialog, /Briançon/).check();
    await validate(dialog).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText([`Tom monte à ${BRIANCON}`]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.briancon });
    await numbersHidden(() => expect(line(page, "Nina", "Tom")).toContainText(`monte à ${BRIANCON}`));
    await expect(changeButton(page, "Nina", "Tom")).toBeFocused();
    // RV4.4: the same seat in the same car, at the same boarding time; the same free seats.
    await expect(free).toHaveCount(1);
    expect(await placedAt()).toEqual(before);

    await bar(page).getByRole("button", { name: "Annuler" }).click();
    await expect(messages(page)).toHaveText([`Tom monte à ${PRELLES}`]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.prelles });
    await numbersHidden(() => expect(line(page, "Nina", "Tom")).toContainText(`monte à ${PRELLES}`));
  });

  test("RV4.2: the departure, « Tom monte au lieu de départ », and « Annuler » gives Prelles back", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const dialog = await openTom(page);
    await choice(dialog, START_CHOICE).check();
    await validate(dialog).click();

    await expect(messages(page)).toHaveText(["Tom monte au lieu de départ"]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: null });
    await numbersHidden(() => expect(line(page, "Nina", "Tom")).toContainText("monte au départ"));
    await bar(page).getByRole("button", { name: "Annuler" }).click();
    await expect(messages(page)).toHaveText([`Tom monte à ${PRELLES}`]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.prelles });
  });

  test("RV4.2: Léa, at the departure, goes to a point", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    await changeButton(page, "Nina", "Léa").click();
    const dialog = sheet(page, "Léa");
    await expect(choice(dialog, START_CHOICE)).toBeChecked();
    await choice(dialog, /Monétier/).check();
    await validate(dialog).click();
    await expect(messages(page)).toHaveText([`Léa monte à ${MONETIER}`]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Léa)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.monetier });
  });

  test("RV4.2: the same point closes the sheet without a request, nor a message; « Annuler » of the sheet does too", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const sent = actions(page, scene.cars.nina);
    let dialog = await openTom(page);
    await validate(dialog).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await choice(await openTom(page), /Briançon/).check();
    await cancel(sheet(page, "Tom")).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Chosen and chosen back: still the same point.
    dialog = await openTom(page);
    await choice(dialog, /Briançon/).check();
    await choice(dialog, /Prelles/).check();
    await validate(dialog).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(messages(page)).toHaveCount(0);
    // The count only: a body carries the device's token, and a failed `toEqual` would print it.
    expect(sent.length).toBe(0);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.prelles });
  });

  test("RV4.3: offline with the sheet open, it keeps the choice and says so, the focus on « Valider »; nothing is written", async ({ context, db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const dialog = await openTom(page);
    await choice(dialog, /Briançon/).check();
    await context.setOffline(true);
    await validate(dialog).click();

    await expect(alerts(dialog)).toHaveText("Action impossible, vérifiez la connexion");
    await expect(dialog).toBeVisible();
    await expect(choice(dialog, /Briançon/)).toBeChecked();
    await expect(validate(dialog)).toBeFocused();
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.prelles });

    // Online again, the same sheet sends the same point.
    await context.setOffline(false);
    await validate(dialog).click();
    await expect(messages(page)).toHaveText([`Tom monte à ${BRIANCON}`]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.briancon });
  });

  test("RV4.3: the sheet closed before the answer, offline then, the bar says the point was not changed; the card keeps the old point", async ({ context, db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const lose = await loseFirst(page, scene.stops.briancon);
    const dialog = await openTom(page);
    await choice(dialog, /Briançon/).check();
    await validate(dialog).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.setOffline(true);
    lose();

    await expect(messages(page)).toHaveText(["Le point de Tom n’a pas été changé. Vérifiez la connexion, puis réessayez."]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.prelles });
    await numbersHidden(() => expect(line(page, "Nina", "Tom")).toContainText(`monte à ${PRELLES}`));
  });

  test("RV4.3: the sheet closed before a server error, the bar says why", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const answer = await holdFirst(page, scene.stops.briancon, true);
    const dialog = await openTom(page);
    await choice(dialog, /Briançon/).check();
    await validate(dialog).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await failHeld(page, answer);

    await expect(messages(page)).toHaveText(["Le point de Tom n’a pas été changé. Une erreur est survenue : réessayez dans un instant."]);
  });

  test("RV4.3: the car gone while the sheet is open, it says so and only « Fermer » is left, with the focus", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const dialog = await openTom(page);
    await choice(dialog, /Briançon/).check();
    await db.deleteFrom("ride").where("id", "=", scene.cars.nina).execute();
    await validate(dialog).click();

    await expect(alerts(dialog)).toHaveText("Cette voiture n’est plus proposée");
    await expect(group(dialog)).toHaveCount(0);
    await expect(validate(dialog)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Fermer" })).toBeFocused();
    await dialog.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
  });

  test("RV4.3: the car gone, the sheet closed before the answer, the bar says why", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const answer = await holdFirst(page, scene.stops.briancon, false);
    const dialog = await openTom(page);
    await choice(dialog, /Briançon/).check();
    await validate(dialog).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await db.deleteFrom("ride").where("id", "=", scene.cars.nina).execute();
    answer();

    await expect(messages(page)).toHaveText(["Le point de Tom n’a pas été changé. Cette voiture n’est plus proposée."]);
    await expect(car(page, "Nina")).toHaveCount(0);
  });

  test("RV4.3, RV3.4: the point deleted while the sheet is open, Tom boards at the departure, the sheet closes, the bar says it", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    const dialog = await openTom(page);
    await choice(dialog, /Briançon/).check();
    await db.deleteFrom("stop").where("id", "=", scene.stops.briancon).execute();
    await validate(dialog).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Ce point n’existe plus : Tom monte au lieu de départ."]);
    await expect(alerts(page.locator("body"))).toHaveCount(0);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: null });
    await numbersHidden(() => expect(line(page, "Nina", "Tom")).toContainText("monte au départ"));
  });

  test("RV7.2: the keyboard alone: Enter on the button, arrows move the choice, Tab reaches « Valider »", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    await changeButton(page, "Nina", "Tom").focus();
    await page.keyboard.press("Enter");
    const dialog = sheet(page, "Tom");
    const row = (name: string | RegExp) => choice(dialog, name).locator("xpath=ancestor::label");
    await expect(choice(dialog, /Prelles/)).toBeFocused();
    await expect(row(/Prelles/)).toHaveCSS("outline-width", "2px");
    await expect(row(/Prelles/)).toHaveCSS("outline-style", "solid");
    // Radix ticks a choice that an arrow key moved the focus to, while the key is down: held a moment, as a hand does.
    await page.keyboard.press("ArrowDown", { delay: 50 });
    await expect(choice(dialog, /Briançon/)).toBeChecked();
    await page.keyboard.press("ArrowDown", { delay: 50 });
    await expect(choice(dialog, /Monétier/)).toBeChecked();
    await page.keyboard.press("ArrowUp", { delay: 50 });
    await expect(choice(dialog, /Briançon/)).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(cancel(dialog)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(validate(dialog)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(messages(page)).toHaveText([`Tom monte à ${BRIANCON}`]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.briancon });
  });

  test("RV7.3: « monte au départ » and « monte à … » on a passenger's line, and the ticked choice, make 4,5:1 on their ground", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id);
    for (const [firstName, text] of [["Léa", "monte au départ"], ["Tom", `monte à ${PRELLES}`]]) {
      const row = line(page, "Nina", firstName);
      await numbersHidden(async () => expect(await contrast(row.getByText(text), row)).toBeGreaterThanOrEqual(4.5));
    }
    const dialog = await openTom(page);
    for (const name of [START_CHOICE, /Briançon/]) {
      await choice(dialog, name).check();
      const row = choice(dialog, name).locator("xpath=ancestor::label");
      expect(await contrast(row.locator("span[id$='-label']"), row)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("RV6.2: the driver changes a point's place and time: its passengers keep it, and the card says « monte à » the new place", async ({ db, page, seededEvent }) => {
    // The device's Nina drives; Paul and Zoé, of another device, board at her first point.
    const driver = await seedPerson(db, seededEvent.id, { firstName: "Nina", phone: DRIVER_PHONE }, token);
    const nina = await seedRide(db, seededEvent.id, driver.id, { departureTime: "07:00:00", seats: 4, location: START });
    const prelles = await seedStop(db, seededEvent.id, nina, { location: PRELLES, time: "07:10:00" });
    await seedStop(db, seededEvent.id, nina, { location: BRIANCON, time: "07:20:00" });
    for (const firstName of ["Paul", "Zoé"]) {
      const person = (await seedPerson(db, seededEvent.id, { firstName })).id;
      await seedPlacement(db, { personId: person, eventId: seededEvent.id, leg: "aller", rideId: nina, stopId: prelles });
    }
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await numbersHidden(() => expect(line(page, "Nina", "Paul")).toContainText(`monte à ${PRELLES}`));

    await car(page, "Nina").getByRole("button", { name: "Modifier", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Modifier la voiture", exact: true });
    const place = form.getByRole("combobox", { name: "Lieu du point 1", exact: true });
    await expect(place).toHaveValue(PRELLES);
    await place.fill("Prelles-sur-Gier");
    await expect(form.getByRole("group", { name: "Point 1", exact: true }).locator("p", { hasText: "Votre texte sera gardé tel quel." })).toBeVisible();
    await form.getByLabel("Heure du point 1", { exact: true }).fill("07:15");
    await form.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(form).toHaveCount(0);

    for (const firstName of ["Paul", "Zoé"]) {
      await numbersHidden(() => expect(line(page, "Nina", firstName)).toContainText("monte à Prelles-sur-Gier"));
      await numbersHidden(() => expect(line(page, "Nina", firstName)).not.toContainText(`monte à ${PRELLES}`));
    }
    await numbersHidden(() => expect(car(page, "Nina").getByRole("list", { name: "Points de RDV" }).getByRole("listitem")).toHaveText(["07:15Prelles-sur-Gier", `07:20${BRIANCON}`]));
    const kept = await db.selectFrom("placement").select("stop_id").where("ride_id", "=", nina).execute();
    expect(kept.map((row) => row.stop_id)).toEqual([prelles, prelles]);
  });
});

test.describe("« Changer le point » at 360 px", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 740 }, eventFields: { stopsEnabled: true } });
  const token = newToken();
  /** 120 characters with no space, and others with some: both must wrap. */
  const LONG = "Parking de la grande surface du village de Saint-Pierre-de-la-Grande-Montagne-sur-les-Hauts-Plateaux-de-la-Vallée-Profonde".slice(0, 120).replaceAll(" ", "-");
  const WORDS = "Place de la mairie, devant la boulangerie du centre-ville et le grand parking gratuit près de l’église ancienne".slice(0, 120);

  test("RV7.1: six points of 120 characters and three passengers of the device: the card and the sheet do not overflow sideways, every target is 44 px", async ({ db, page, seededEvent }) => {
    const other = async (firstName: string) => (await seedPerson(db, seededEvent.id, { firstName })).id;
    const nina = await seedRide(db, seededEvent.id, await other("Nina"), { departureTime: "08:00:00", seats: 5, location: LONG });
    const stops: string[] = [];
    for (let index = 0; index < 6; index++) {
      stops.push(await seedStop(db, seededEvent.id, nina, { location: index % 2 ? WORDS : LONG, time: `08:${10 + index * 5}:00` }));
    }
    for (const [index, firstName] of ["Tom", "Léa", "Ana"].entries()) {
      const person = (await seedPerson(db, seededEvent.id, { firstName }, token)).id;
      await seedPlacement(db, { personId: person, eventId: seededEvent.id, leg: "aller", rideId: nina, stopId: index === 1 ? null : stops[index * 2 + 1] });
    }
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);

    const overflow = (locator: Locator) => locator.evaluate((element) => element.scrollWidth - element.clientWidth);
    await numbersHidden(() => expect(car(page, "Nina").getByRole("button", { name: /^Changer le point/ })).toHaveCount(3));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await overflow(car(page, "Nina"))).toBeLessThanOrEqual(0);
    for (const button of await car(page, "Nina").getByRole("button", { name: /^Changer le point/ }).all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await changeButton(page, "Nina", "Tom").click();
    const dialog = sheet(page, "Tom");
    await expect(group(dialog).getByRole("radio")).toHaveCount(7);
    expect(await overflow(dialog)).toBeLessThanOrEqual(0);
    expect(await overflow(group(dialog))).toBeLessThanOrEqual(0);
    for (const row of await group(dialog).locator("label").all()) {
      const box = (await row.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
    }
    for (const button of [cancel(dialog), validate(dialog)]) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // « Valider » stays reachable in the bar of the sheet, whatever the list's length.
    await expect(validate(dialog)).toBeInViewport();
  });
});

test.describe("« Changer le point », in a browser set to English", () => {
  test.use({ locale: "en-GB", eventFields: { stopsEnabled: true } });
  const token = newToken();

  test("WCAG 2.5.3: the accessible name of the button contains its visible text", async ({ db, page, seededEvent }) => {
    await seedScene(db, seededEvent.id, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    const nina = page.getByRole("tabpanel").getByRole("article", { name: "Nina’s car" });
    await numbersHidden(async () => {
      const button = nina.getByRole("button", { name: "Change the point where Tom boards", exact: true });
      await expect(button).toHaveText("Change the point");
      expect(await button.getAttribute("aria-label")).toContain((await button.innerText()).trim());
    });
  });
});
