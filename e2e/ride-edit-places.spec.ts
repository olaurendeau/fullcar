import { randomUUID } from "node:crypto";
import type { Page, Request, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import type { Position } from "@/domain/place";
import { seedPerson, seedRide } from "@/db/test-participants";
import { holdToken, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { answerFor, photonFeature, requestsFor, type PhotonFeature } from "./photon";

leaveNoToken();

// #431: the place of « Modifier la voiture », with suggestions (place-autocomplete, states 6 (b)
// and (c), 15 and 16, « Un lieu, une valeur »), against the slot's fake Photon. A car's place
// loses its position at any change of its text (owner's decision, v3), « Position enregistrée » included.

type Db = Kysely<Database>;

const FR = {
  title: "Modifier la voiture",
  departure: "Lieu de départ",
  note: "Note (facultatif)",
  hint: "Visible par toutes les personnes qui ont le lien.",
  saved: "Position enregistrée",
  remove: "Retirer la position (Lieu de départ)",
  added: "Position ajoutée.",
  removed: "Position retirée.",
  tooLong: "120 caractères au maximum.",
  failed: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
};

/** The event's position, which Photon receives rounded to 1 decimal (AL4.1). */
const EVENT_AT = { lat: 45.7581, lng: 4.6894 };

/** A text of this test's own: the fake keeps its answers an hour, and the app its cache. */
const textOf = (label: string) => `${label} ${randomUUID()}`;

/** A named place in France, which the page writes « {name}, {postcode} {city} ». */
function namedPlace(name: string, lat: number, lon: number, postcode: string, city: string): { feature: PhotonFeature; label: string } {
  return {
    feature: photonFeature({ lat, lon, name, postcode, city, countrycode: "FR", country: "France" }),
    label: `${name}, ${postcode} ${city}`,
  };
}

const LILAS = namedPlace("12 rue des Lilas", 45.721234, 4.698762, "69126", "Brindas");
const MAIRIE = namedPlace("Mairie", 45.737011, 4.659876, "69670", "Vaugneray");
const AT_LILAS = { location_lat: 45.72123, location_lng: 4.69876 };
const AT_MAIRIE = { location_lat: 45.73701, location_lng: 4.65988 };
const NOWHERE = { location_lat: null, location_lng: null };

const form = (page: Page) => page.getByRole("dialog", { name: FR.title, exact: true });
const place = (page: Page) => form(page).getByRole("combobox", { name: FR.departure, exact: true });
const list = (page: Page) => form(page).getByRole("listbox", { name: `Propositions pour ${FR.departure}`, exact: true });
const options = (page: Page) => list(page).getByRole("option");
const status = (page: Page) => form(page).getByRole("status");
const positionLine = (page: Page) => form(page).getByText(/^Position (enregistrée$|: )/);
const removeButton = (page: Page) => form(page).getByRole("button", { name: FR.remove, exact: true });
const submit = (page: Page) => form(page).getByRole("button", { name: "Valider", exact: true });

const isSearch = (request: Request) => new URL(request.url()).pathname === "/api/lieux";

/** The page's requests to `/api/lieux`, from now on. */
function searches(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => isSearch(request) && sent.push(request));
  return sent;
}

/**
 * The fields of each change of the car the page sends, from now on: the last argument of the
 * server action, which never holds the device's token (it is an argument of its own).
 */
function changes(page: Page, rideId: string): Record<string, unknown>[] {
  const sent: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    const body = request.headers()["next-action"] && request.postData();
    if (body && body.includes(rideId)) sent.push((JSON.parse(body) as unknown[])[4] as Record<string, unknown>);
  });
  return sent;
}

/** The device holds Claire, who drives a car on the Aller from `location`, at `position`. */
async function seedCar(db: Db, page: Page, eventId: string, location: string, position: Position | null) {
  const token = newToken();
  const claire = await seedPerson(db, eventId, { firstName: "Claire" }, token);
  const rideId = await seedRide(db, eventId, claire.id, { location, position, departureTime: "09:15:00" });
  await holdToken(page, eventId, token);
  return rideId;
}

/** « Modifier » on Claire's car: « Modifier la voiture », its place filled with the car's. */
async function openForm(page: Page, eventId: string, location: string) {
  await page.goto(`/e/${eventId}`);
  await page.getByRole("article", { name: "Voiture de Claire" }).getByRole("button", { name: "Modifier", exact: true }).click();
  await expect(place(page)).toHaveValue(location);
}

/** `text` typed in the place, answered with `places`, and the option `chosen` tapped. */
async function choose(page: Page, places: { feature: PhotonFeature }[], chosen = 0) {
  const text = textOf("Mair");
  await answerFor(text, { features: places.map(({ feature }) => feature) });
  await place(page).fill(text);
  await expect(options(page)).toHaveCount(places.length);
  await options(page).nth(chosen).click();
  return text;
}

/** Each text the field's `status` region is given, from now on, in order. */
async function recordStatus(page: Page) {
  await status(page).evaluate((region) => {
    const said: string[] = [];
    (window as unknown as { said: string[] }).said = said;
    new MutationObserver(() => region.textContent && said.push(region.textContent)).observe(region, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  return () => page.evaluate(() => (window as unknown as { said: string[] }).said);
}

/** The car as stored, once the sheet has closed: its place's text and position. */
async function stored(page: Page, db: Db, rideId: string) {
  await expect(form(page)).toHaveCount(0);
  return db.selectFrom("ride").select(["location", "location_lat", "location_lng"]).where("id", "=", rideId).executeTakeFirstOrThrow();
}

/** Holds the change whose request carries `marker` until `fail` answers it 500; `stop` holds no more. */
async function holdChange(page: Page, marker: string) {
  const held: Route[] = [];
  let arrived!: () => void;
  const sent = new Promise<void>((resolve) => (arrived = resolve));
  const hold = async (route: Route) => {
    const request = route.request();
    if (!(await request.headerValue("next-action")) || !request.postData()?.includes(marker)) return route.fallback();
    held.push(route);
    arrived();
  };
  await page.route("**/e/**", hold);
  return {
    sent,
    fail: async () => {
      for (const route of held.splice(0)) await route.fulfill({ status: 500, contentType: "text/plain", body: "" });
    },
    stop: () => page.unroute("**/e/**", hold),
  };
}

test.describe("the place of « Modifier la voiture »", () => {
  test.use({ locale: "fr-FR", eventFields: { locationPosition: EVENT_AT } });

  test("AL5.1, AL1.9 (c): opened with « Position enregistrée », then the sentence, in that order in aria-describedby; nothing is asked", async ({
    page,
    db,
    seededEvent,
  }) => {
    await seedCar(db, page, seededEvent.id, LILAS.label, { lat: 45.72123, lng: 4.69876 });
    await page.clock.install();
    const sent = searches(page);
    await openForm(page, seededEvent.id, LILAS.label);

    await expect(positionLine(page)).toHaveText([FR.saved]);
    await expect(removeButton(page)).toBeVisible();
    await expect(place(page)).toHaveAccessibleDescription(`${FR.saved} ${FR.hint}`);
    await page.clock.runFor(5_000);
    expect(sent.length).toBe(0);
  });

  test("AL1.9 (b): a car's place in error: the error, then the sentence", async ({ page, db, seededEvent }) => {
    await seedCar(db, page, seededEvent.id, "Mairie de Cesson", null);
    await openForm(page, seededEvent.id, "Mairie de Cesson");
    await place(page).fill("x".repeat(121));
    await submit(page).click();
    await expect(place(page)).toBeFocused();
    await expect(place(page)).toHaveAccessibleDescription(`${FR.tooLong} ${FR.hint}`);
  });

  test("AL3.6: the first keystroke takes « Position enregistrée », said once, the sentence kept; « Valider » saves the text without a position", async ({
    page,
    db,
    seededEvent,
  }) => {
    const rideId = await seedCar(db, page, seededEvent.id, LILAS.label, { lat: 45.72123, lng: 4.69876 });
    await openForm(page, seededEvent.id, LILAS.label);
    const said = await recordStatus(page);

    await place(page).press("End");
    await place(page).press("Backspace");
    await expect(positionLine(page)).toHaveCount(0);
    await expect(removeButton(page)).toHaveCount(0);
    await expect(place(page)).toHaveAccessibleDescription(FR.hint);
    await expect(status(page)).toHaveText(FR.removed);
    await place(page).fill("Brindas");
    expect(await said()).toEqual([FR.removed]);

    await submit(page).click();
    expect(await stored(page, db, rideId)).toEqual({ location: "Brindas", ...NOWHERE });
  });

  test("AL3.6, AL4.1: after the saved position is gone, a choice gives one back, asked near the event at 1 decimal", async ({ page, db, seededEvent }) => {
    const rideId = await seedCar(db, page, seededEvent.id, LILAS.label, { lat: 45.72123, lng: 4.69876 });
    await openForm(page, seededEvent.id, LILAS.label);

    const text = await choose(page, [MAIRIE]);
    await expect(place(page)).toHaveValue(MAIRIE.label);
    await expect(positionLine(page)).toHaveText([`Position : ${MAIRIE.label}`]);
    await expect(status(page)).toHaveText(FR.added);
    const query = new URLSearchParams((await requestsFor(text))[0].query);
    expect([query.get("lat"), query.get("lon")]).toEqual(["45.8", "4.7"]);

    await submit(page).click();
    expect(await stored(page, db, rideId)).toEqual({ location: MAIRIE.label, ...AT_MAIRIE });
  });

  test("AL5.2: « Retirer » alone, then « Valider », saves the place without a position, sent text and position together", async ({ page, db, seededEvent }) => {
    const rideId = await seedCar(db, page, seededEvent.id, LILAS.label, { lat: 45.72123, lng: 4.69876 });
    const sent = changes(page, rideId);
    await openForm(page, seededEvent.id, LILAS.label);

    await removeButton(page).click();
    await expect(place(page)).toBeFocused();
    await expect(positionLine(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(FR.removed);
    await submit(page).click();

    expect(await stored(page, db, rideId)).toEqual({ location: LILAS.label, ...NOWHERE });
    expect(sent.length).toBe(1);
    expect([sent[0].location, sent[0].position]).toEqual([LILAS.label, null]);
  });

  test("AL5.2: nothing changed, « Valider » sends nothing; a change of the note alone sends neither the place nor its position", async ({ page, db, seededEvent }) => {
    const rideId = await seedCar(db, page, seededEvent.id, LILAS.label, { lat: 45.72123, lng: 4.69876 });
    const sent = changes(page, rideId);
    await openForm(page, seededEvent.id, LILAS.label);
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);

    // Had the first « Valider » sent anything, `sent` would hold two.
    await page.getByRole("article", { name: "Voiture de Claire" }).getByRole("button", { name: "Modifier", exact: true }).click();
    await form(page).getByLabel(FR.note, { exact: true }).fill("Coffre plein");
    await submit(page).click();
    expect(await stored(page, db, rideId)).toEqual({ location: LILAS.label, ...AT_LILAS });
    expect(sent.length).toBe(1);
    expect(Object.keys(sent[0]).sort()).toEqual(["leaving", "note", "seenPassengerIds"]);
  });

  test("AL5.3 case 2: a car without a position takes the suggestion of its own text: the request carries location and position, the car is saved with it", async ({
    page,
    db,
    seededEvent,
  }) => {
    const rideId = await seedCar(db, page, seededEvent.id, MAIRIE.label, null);
    const sent = changes(page, rideId);
    await openForm(page, seededEvent.id, MAIRIE.label);
    await expect(positionLine(page)).toHaveCount(0);

    await choose(page, [MAIRIE]);
    await expect(place(page)).toHaveValue(MAIRIE.label);
    await expect(positionLine(page)).toHaveText([`Position : ${MAIRIE.label}`]);
    await expect(place(page)).toHaveAccessibleDescription(`Position : ${MAIRIE.label} ${FR.hint}`);
    await submit(page).click();

    expect(await stored(page, db, rideId)).toEqual({ location: MAIRIE.label, ...AT_MAIRIE });
    expect(sent.length).toBe(1);
    // The suggestion's position, as the route gives it: rounded to 5 decimals.
    expect([sent[0].location, sent[0].position]).toEqual([MAIRIE.label, { lat: 45.73701, lng: 4.65988 }]);
  });

  test("AL1.5: Escape closes the list alone, the text kept and the focus in the field; a second Escape closes the sheet", async ({ page, db, seededEvent }) => {
    await seedCar(db, page, seededEvent.id, "Mairie de Cesson", null);
    const text = textOf("Gare");
    await answerFor(text, { features: [LILAS.feature, MAIRIE.feature] });
    await openForm(page, seededEvent.id, "Mairie de Cesson");

    await place(page).fill(text);
    await expect(options(page)).toHaveCount(2);
    await place(page).press("Escape");
    await expect(list(page)).toBeHidden();
    // Still visible while it slides out: Radix says at once whether it is closing.
    await expect(form(page)).toHaveAttribute("data-state", "open");
    await expect(place(page)).toHaveValue(text);
    await expect(place(page)).toBeFocused();

    await place(page).press("Escape");
    await expect(form(page)).toHaveCount(0);
  });

  test("AL5.4, AL5.5: while the change is sending, « Retirer » is aria-disabled and does nothing; failed, the form keeps the text and the position sent", async ({
    page,
    db,
    seededEvent,
  }) => {
    const rideId = await seedCar(db, page, seededEvent.id, LILAS.label, { lat: 45.72123, lng: 4.69876 });
    const marker = textOf("Coffre");
    const change = await holdChange(page, marker);
    await openForm(page, seededEvent.id, LILAS.label);
    await form(page).getByLabel(FR.note, { exact: true }).fill(marker);
    await choose(page, [MAIRIE]);

    await submit(page).click();
    await change.sent;
    await expect(removeButton(page)).toHaveAttribute("aria-disabled", "true");
    // Tapped: a button `aria-disabled` takes the tap, which Playwright's click would wait out.
    await removeButton(page).dispatchEvent("click");
    await change.fail();

    await expect(form(page).getByRole("alert")).toHaveText(FR.failed);
    await expect(place(page)).toHaveValue(MAIRIE.label);
    await expect(positionLine(page)).toHaveText([`Position : ${MAIRIE.label}`]);
    await expect(removeButton(page)).not.toHaveAttribute("aria-disabled");

    await change.stop();
    await submit(page).click();
    expect(await stored(page, db, rideId)).toEqual({ location: MAIRIE.label, ...AT_MAIRIE });
  });

  test("AL5.4: while the change is sending, a keystroke asks nothing and an answer awaited opens no list", async ({ page, db, seededEvent }) => {
    await seedCar(db, page, seededEvent.id, "Mairie de Cesson", null);
    const marker = textOf("Coffre");
    const later = textOf("Gare routière");
    await answerFor(later, { features: [LILAS.feature] });
    await page.clock.install();
    const change = await holdChange(page, marker);
    const sent = searches(page);
    await openForm(page, seededEvent.id, "Mairie de Cesson");
    await form(page).getByLabel(FR.note, { exact: true }).fill(marker);

    // Enter in the place sends the form while its pause is under way.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
    await place(page).fill(later);
    await place(page).press("Enter");
    await change.sent;
    await page.clock.runFor(5_000);
    await place(page).pressSequentially(" bis");
    await page.clock.runFor(5_000);
    await page.clock.resume();
    await change.fail();

    await expect(form(page).getByRole("alert")).toHaveText(FR.failed);
    expect(sent.length).toBe(0);
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveValue(`${later} bis`);
    expect((await requestsFor(later)).length + (await requestsFor(`${later} bis`)).length).toBe(0);
  });
});
