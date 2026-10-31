import type { Locator, Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide, seedStop } from "@/db/test-participants";
import { contrast } from "./contrast";
import { failHeld, holdFirst, holdToken, loseFirst, messages, newToken } from "./device";
import { numbersHidden } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #890, epic #881: the meeting points of a car on its card (RV2), and the choice of one when
// taking a seat (RV3). On a car with points a tap on a free seat opens the sheet, the departure
// ticked (D2); a car without keeps its one tap (RV3.1). Every assertion that reads a card goes
// through `numbersHidden`: a card holds `tel:` links.

type Db = Kysely<Database>;

const PRELLES = "Prelles boucherie";
const BRIANCON = "Briançon carrefour";
const MONETIER = "Monétier";
const START = "Champcella";

/**
 * Aller. Nina (4 seats, 08:00, from Champcella) has three points: Prelles 08:25, Briançon 08:35 and
 * Monétier 08:50; Paul, of another device, boards at Prelles, Zoé at the departure. Claire (1 seat,
 * 07:00) has one point, Gare de Prelles at 07:20. Sam (2 seats, 09:00, from Valence) has none.
 * The device holds `mine`, each without a car on the aller; none without `token`.
 */
async function seedScene(db: Db, eventId: string, token: string | undefined, mine: string[]) {
  const other = async (firstName: string) => (await seedPerson(db, eventId, { firstName })).id;
  const nina = await seedRide(db, eventId, await other("Nina"), { departureTime: "08:00:00", seats: 4, location: START });
  const claire = await seedRide(db, eventId, await other("Claire"), { departureTime: "07:00:00", seats: 1, location: "Gare de Cesson" });
  const sam = await seedRide(db, eventId, await other("Sam"), { departureTime: "09:00:00", seats: 2, location: "Valence" });
  const stops = {
    prelles: await seedStop(db, eventId, nina, { location: PRELLES, time: "08:25:00" }),
    briancon: await seedStop(db, eventId, nina, { location: BRIANCON, time: "08:35:00" }),
    monetier: await seedStop(db, eventId, nina, { location: MONETIER, time: "08:50:00" }),
    gare: await seedStop(db, eventId, claire, { location: "Gare de Prelles", time: "07:20:00" }),
  };
  const paul = await other("Paul");
  await seedPlacement(db, { personId: paul, eventId, leg: "aller", rideId: nina, stopId: stops.prelles });
  await seedPlacement(db, { personId: await other("Zoé"), eventId, leg: "aller", rideId: nina });
  const persons: Record<string, string> = {};
  if (token) {
    for (const firstName of mine) {
      persons[firstName] = (await seedPerson(db, eventId, { firstName }, token)).id;
      await seedPlacement(db, { personId: persons[firstName], eventId, leg: "aller", rideId: null });
    }
  }
  return { cars: { nina, claire, sam }, stops, persons };
}
type Scene = Awaited<ReturnType<typeof seedScene>>;

/** A person's Placement on the aller: its Ride and its Stop. */
async function placementOf(db: Db, eventId: string, personId: string) {
  const row = await db.selectFrom("placement").select(["ride_id", "stop_id"]).where("event_id", "=", eventId).where("person_id", "=", personId).where("leg", "=", "aller").executeTakeFirstOrThrow();
  return { rideId: row.ride_id, stopId: row.stop_id };
}

const panel = (page: Page) => page.getByRole("tabpanel");
const car = (page: Page, driver: string) => panel(page).getByRole("article", { name: `Voiture de ${driver}` });
const seatName = (driver: string) => `Place libre : prendre une place dans la voiture de ${driver}`;
const seat = (page: Page, driver: string) => car(page, driver).getByRole("button", { name: seatName(driver) }).first();
const sheet = (page: Page, driver: string) => page.getByRole("dialog", { name: `Qui monte dans la voiture de ${driver} ?` });
const group = (dialog: Locator) => dialog.getByRole("radiogroup", { name: "Point de montée" });
const choice = (dialog: Locator, name: string | RegExp) => group(dialog).getByRole("radio", { name });
const placeButton = (dialog: Locator) => dialog.getByRole("button", { name: /^Placer/ });
const barStatus = (page: Page) => page.locator('[role="status"]:has(+ [role="alert"])');
const alerts = (scope: Locator) => scope.getByRole("alert").filter({ hasText: /\S/ });
const START_CHOICE = `${START} · 08:00 · Lieu de départ`;

test.describe("meeting points on the card and in the seat sheet", () => {
  test.use({ locale: "fr-FR", eventFields: { stopsEnabled: true } });
  const token = newToken();
  let scene: Scene;

  async function visit(page: Page, db: Db, eventId: string, mine: string[]) {
    scene = await seedScene(db, eventId, token, mine);
    await holdToken(page, eventId, token);
    await page.goto(`/e/${eventId}`);
  }

  test("RV2.1, RV2.2: the points under the place, by time; « monte à » for a passenger of a point alone; none, no list", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    const nina = car(page, "Nina");
    const points = nina.getByRole("list", { name: "Points de RDV" });
    await numbersHidden(() => expect(points.getByRole("listitem")).toHaveText([`08:25${PRELLES}`, `08:35${BRIANCON}`, `08:50${MONETIER}`]));
    // Under the departure's line, not before it.
    expect(await nina.evaluate((card) => {
      const list = card.querySelector('ul[aria-label="Points de RDV"]')!;
      const place = [...card.querySelectorAll("p")].find((p) => p.textContent === "Champcella")!;
      return !!(place.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    const seats = nina.getByRole("list", { name: "Places" }).getByRole("listitem");
    await numbersHidden(() => expect(seats.filter({ hasText: "Paul" })).toContainText(`monte à ${PRELLES}`));
    await numbersHidden(() => expect(seats.filter({ hasText: "Zoé" })).not.toContainText("monte"));
    await numbersHidden(() => expect(car(page, "Sam").getByRole("list", { name: "Points de RDV" })).toHaveCount(0));
    await numbersHidden(() => expect(car(page, "Sam")).not.toContainText("Points de RDV"));
  });

  test("RV3.1: a car without a point keeps its one tap", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    await seat(page, "Sam").click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sam"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.sam, stopId: null });
  });

  test("RV3.2, D2: a car with points opens the sheet even for one person, the departure ticked, and places nobody", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Tom" })).toBeChecked();
    await expect(group(dialog).getByRole("radio")).toHaveCount(4);
    await expect(group(dialog).locator("label")).toHaveText([START_CHOICE, `${PRELLES} · 08:25`, `${BRIANCON} · 08:35`, `${MONETIER} · 08:50`]);
    await expect(choice(dialog, START_CHOICE)).toBeChecked();
    await expect(choice(dialog, /Briançon/)).not.toBeChecked();
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: null, stopId: null });
  });

  test("RV3.2: a car whose sheet has persons but no point to choose from shows no group", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom", "Léa"]);
    await seat(page, "Sam").click();
    await expect(sheet(page, "Sam")).toBeVisible();
    await expect(group(sheet(page, "Sam"))).toHaveCount(0);
  });

  test("RV3.3: two persons at point 2, the bar says so, « Annuler » gives the seats back", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom", "Léa"]);
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    await choice(dialog, /Briançon/).check();
    await placeButton(dialog).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Tom et Léa sont dans la voiture de Nina"]);
    await expect(barStatus(page)).toHaveText("Tom et Léa sont dans la voiture de Nina");
    for (const firstName of ["Tom", "Léa"]) {
      expect(await placementOf(db, seededEvent.id, scene.persons[firstName])).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.briancon });
    }
    const seats = car(page, "Nina").getByRole("list", { name: "Places" }).getByRole("listitem");
    await numbersHidden(() => expect(seats.filter({ hasText: "Tom" })).toContainText(`monte à ${BRIANCON}`));
    await numbersHidden(() => expect(seats.filter({ hasText: "Léa" })).toContainText(`monte à ${BRIANCON}`));

    await page.locator("[data-message-bar]").getByRole("button", { name: "Annuler" }).click();
    await expect(messages(page)).toHaveText(["Tom et Léa ne sont plus dans la voiture de Nina"]);
    for (const firstName of ["Tom", "Léa"]) {
      expect(await placementOf(db, seededEvent.id, scene.persons[firstName])).toEqual({ rideId: null, stopId: null });
    }
    await numbersHidden(() => expect(car(page, "Nina").getByRole("listitem").filter({ hasText: "Tom" })).toHaveCount(0));
  });

  test("RV3.3: the departure, left ticked, places without a point", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    await seat(page, "Nina").click();
    await placeButton(sheet(page, "Nina")).click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Nina"]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: null });
    // Tom is of the device: where he boards is said even at the departure (RV4.1, #892).
    await numbersHidden(() => expect(car(page, "Nina").getByRole("listitem").filter({ hasText: "Tom" })).toContainText("monte au départ"));
  });

  test("RV3.4: the point deleted while the sheet is open, Tom boards at the departure, the sheet closes, the bar says it", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    await choice(dialog, /Prelles/).check();
    await db.deleteFrom("stop").where("id", "=", scene.stops.prelles).execute();
    await placeButton(dialog).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(messages(page)).toHaveText(["Ce point n’existe plus : Tom monte au lieu de départ."]);
    await expect(alerts(page.locator("body"))).toHaveCount(0);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: null });
    await numbersHidden(() => expect(car(page, "Nina").getByRole("listitem").filter({ hasText: "Tom" })).toHaveCount(1));
  });

  test("RV3.5: the last seat taken meanwhile, same words as without a point, and the point is not named", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    const answer = await holdFirst(page, scene.stops.gare, false);
    await seat(page, "Claire").click();
    const dialog = sheet(page, "Claire");
    await choice(dialog, /Gare de Prelles/).check();
    await placeButton(dialog).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const ana = (await seedPerson(db, seededEvent.id, { firstName: "Ana" })).id;
    await seedPlacement(db, { personId: ana, eventId: seededEvent.id, leg: "aller", rideId: scene.cars.claire });
    answer();

    await expect(messages(page)).toHaveText(["Tom n’a pas pu monter dans la voiture de Claire. Cette place vient d’être prise."]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: null, stopId: null });
  });

  test("RV3.6: offline, the sheet stays open with the point and the boxes kept, the focus on « Placer »; nothing is written", async ({ context, db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom", "Léa"]);
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    await dialog.getByRole("checkbox", { name: "Léa" }).uncheck();
    await choice(dialog, /Briançon/).check();
    await context.setOffline(true);
    await placeButton(dialog).click();

    await expect(alerts(dialog)).toHaveText("Action impossible, vérifiez la connexion");
    await expect(dialog).toBeVisible();
    await expect(choice(dialog, /Briançon/)).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Tom" })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "Léa" })).not.toBeChecked();
    await expect(placeButton(dialog)).toBeFocused();
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: null, stopId: null });

    // Online again, the same sheet sends the same point.
    await context.setOffline(false);
    await placeButton(dialog).click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Nina"]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.briancon });
  });

  test("RV3.6: the sheet closed before the answer, offline then, the bar names the car and the person, not the point", async ({ context, db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    const lose = await loseFirst(page, scene.stops.briancon);
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    await choice(dialog, /Briançon/).check();
    await placeButton(dialog).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await context.setOffline(true);
    lose();

    await expect(messages(page)).toHaveText(["Tom n’a pas pu monter dans la voiture de Nina. Vérifiez la connexion, puis réessayez."]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: null, stopId: null });
  });

  test("RV3.6: the sheet closed before a server error, the bar says why, not the point", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    const answer = await holdFirst(page, scene.stops.briancon, true);
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    await choice(dialog, /Briançon/).check();
    await placeButton(dialog).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await failHeld(page, answer);

    await expect(messages(page)).toHaveText(["Tom n’a pas pu monter dans la voiture de Nina. Une erreur est survenue : réessayez dans un instant."]);
  });

  test("RV3.6: a car without a point, a refusal of « Placer » leaves the focus in the name field being typed", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom", "Léa"]);
    const answer = await holdFirst(page, scene.cars.sam, true);
    await seat(page, "Sam").click();
    const dialog = sheet(page, "Sam");
    await placeButton(dialog).click();
    await dialog.getByRole("button", { name: "Ajouter une personne", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Ajouter une personne" });
    const name = form.getByLabel("Prénom");
    await name.fill("Inès");
    await expect(name).toBeFocused();
    await failHeld(page, answer);

    await expect(name).toBeFocused();
    await expect(name).toHaveValue("Inès");
  });

  test("RV3.6: a car with points, a refusal of « Placer » leaves the focus in the name field being typed, not on « Placer »", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom", "Léa"]);
    const answer = await holdFirst(page, scene.cars.nina, true);
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    await placeButton(dialog).click();
    await dialog.getByRole("button", { name: "Ajouter une personne", exact: true }).click();
    const name = page.getByRole("dialog", { name: "Ajouter une personne" }).getByLabel("Prénom");
    await name.fill("Inès");
    await expect(name).toBeFocused();
    await failHeld(page, answer);
    // The page takes the failure after the response, and moves the focus in the commit that says it: given the time to, in the page's own clock.
    await page.evaluate(() => new Promise<void>((done) => setTimeout(done, 250)));

    await expect(name).toBeFocused();
    await expect(name).toHaveValue("Inès");
  });

  test("RV7.2: the focus enters on the ticked choice, ringed 2 px; arrows move the choice; the point chosen is sent", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    // By the keyboard, so that the ring shows as it does for a keyboard user.
    await seat(page, "Nina").focus();
    await page.keyboard.press("Enter");
    const dialog = sheet(page, "Nina");
    const row = (name: string | RegExp) => choice(dialog, name).locator("xpath=ancestor::label");
    await expect(choice(dialog, START_CHOICE)).toBeFocused();
    await expect(row(START_CHOICE)).toHaveCSS("outline-width", "2px");
    await expect(row(START_CHOICE)).toHaveCSS("outline-style", "solid");

    // Radix ticks a choice that an arrow key moved the focus to, while the key is down: held a moment, as a hand does.
    await page.keyboard.press("ArrowDown", { delay: 50 });
    await expect(choice(dialog, /Prelles/)).toBeChecked();
    await expect(choice(dialog, /Prelles/)).toBeFocused();
    await expect(choice(dialog, START_CHOICE)).not.toBeChecked();
    await page.keyboard.press("ArrowDown", { delay: 50 });
    await page.keyboard.press("ArrowDown", { delay: 50 });
    await expect(choice(dialog, /Monétier/)).toBeChecked();
    await page.keyboard.press("ArrowUp", { delay: 50 });
    await expect(choice(dialog, /Briançon/)).toBeChecked();
    // Space ticks a choice that is not: the focus put on Monétier without ticking it (a click would).
    await choice(dialog, /Monétier/).focus();
    await expect(choice(dialog, /Monétier/)).not.toBeChecked();
    await page.keyboard.press("Space");
    await expect(choice(dialog, /Monétier/)).toBeChecked();
    await expect(choice(dialog, /Briançon/)).not.toBeChecked();
    await placeButton(dialog).click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Nina"]);
    expect(await placementOf(db, seededEvent.id, scene.persons.Tom)).toEqual({ rideId: scene.cars.nina, stopId: scene.stops.monetier });
  });

  test("RV7.3: the text of the passengers' lines and of the ticked choice makes 4,5:1 on its ground", async ({ db, page, seededEvent }) => {
    await visit(page, db, seededEvent.id, ["Tom"]);
    const line = car(page, "Nina").getByRole("listitem").filter({ hasText: "Paul" });
    await numbersHidden(async () => expect(await contrast(line.getByText(`monte à ${PRELLES}`), line)).toBeGreaterThanOrEqual(4.5));
    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    for (const name of [START_CHOICE, /Briançon/]) {
      await choice(dialog, name).check();
      const row = choice(dialog, name).locator("xpath=ancestor::label");
      expect(await contrast(row.locator("span[id$='-label']"), row)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("Q3: a device without a person registers from the seat, and boards at the departure", async ({ db, page, seededEvent }) => {
    scene = await seedScene(db, seededEvent.id, undefined, []);
    await page.goto(`/e/${seededEvent.id}`);
    await seat(page, "Nina").click();
    await expect(page.getByRole("dialog", { name: "Ajouter une personne" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Point de montée" })).toHaveCount(0);
  });
});

test.describe("meeting points at 360 px", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 740 }, eventFields: { stopsEnabled: true } });
  const token = newToken();
  /** 120 characters with no space, and others with some: both must wrap. */
  const LONG = "Parking de la grande surface du village de Saint-Pierre-de-la-Grande-Montagne-sur-les-Hauts-Plateaux-de-la-Vallée-Profonde".slice(0, 120).replaceAll(" ", "-");
  const WORDS = "Place de la mairie, devant la boulangerie du centre-ville et le grand parking gratuit près de l’église ancienne".slice(0, 120);

  test("RV7.1: six points of 120 characters and three passengers: nothing overflows sideways, every target is 44 px", async ({ db, page, seededEvent }) => {
    const other = async (firstName: string) => (await seedPerson(db, seededEvent.id, { firstName })).id;
    const nina = await seedRide(db, seededEvent.id, await other("Nina"), { departureTime: "08:00:00", seats: 5, location: LONG });
    const stops: string[] = [];
    for (let index = 0; index < 6; index++) {
      stops.push(await seedStop(db, seededEvent.id, nina, { location: index % 2 ? WORDS : LONG, time: `08:${10 + index * 5}:00` }));
    }
    for (const [index, firstName] of ["Paul", "Zoé", "Léo"].entries()) {
      await seedPlacement(db, { personId: await other(firstName), eventId: seededEvent.id, leg: "aller", rideId: nina, stopId: stops[index] });
    }
    const tom = (await seedPerson(db, seededEvent.id, { firstName: "Tom" }, token)).id;
    await seedPlacement(db, { personId: tom, eventId: seededEvent.id, leg: "aller", rideId: null });
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);

    const overflow = (locator: Locator) => locator.evaluate((element) => element.scrollWidth - element.clientWidth);
    const card = car(page, "Nina");
    await numbersHidden(() => expect(card.getByRole("list", { name: "Points de RDV" }).getByRole("listitem")).toHaveCount(6));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(await overflow(card)).toBeLessThanOrEqual(0);
    const lines = card.getByRole("list", { name: "Places" }).getByRole("listitem");
    for (const line of await lines.all()) expect((await line.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await seat(page, "Nina").click();
    const dialog = sheet(page, "Nina");
    await expect(group(dialog).getByRole("radio")).toHaveCount(7);
    expect(await overflow(dialog)).toBeLessThanOrEqual(0);
    expect(await overflow(group(dialog))).toBeLessThanOrEqual(0);
    for (const row of await group(dialog).locator("label").all()) {
      const box = (await row.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
    }
    expect((await placeButton(dialog).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
