import type { Locator, Page, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { expect, leaveNoToken, test } from "./fixtures";
import { answerFor, requestsFor, type PhotonFeature } from "./photon";
import { namedPlace, recordStatus, searches, textOf } from "./place-field";

// A new driver's token is drawn as her car is offered.
leaveNoToken();

// #430: the places of « Proposer une voiture », with suggestions (place-autocomplete, states 4 bis,
// 11, 12 and 13, « Un lieu, une valeur »), against the slot's fake Photon. A car's place loses its
// position at any change of its text (owner's decision, v3).

type Db = Kysely<Database>;

const FR = {
  offer: "Proposer une voiture",
  firstName: "Prénom",
  departure: "Lieu de départ",
  dropOff: "Lieu de dépose",
  retour: "Au retour",
  drive: "Je ramène aussi des personnes",
  note: "Note (facultatif)",
  hint: "Visible par toutes les personnes qui ont le lien.",
  added: "Position ajoutée.",
  removed: "Position retirée.",
  failed: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
};

/** The event's position, which Photon receives rounded to 1 decimal (AL4.1). */
const EVENT_AT = { lat: 45.7581, lng: 4.6894 };

/** A named place in Brindas, « {name}, 69126 Brindas ». */
const inBrindas = (name: string, lat: number, lon: number) => namedPlace(name, lat, lon, "69126", "Brindas");

const LILAS = inBrindas("12 rue des Lilas", 45.721234, 4.698762);
const MAIRIE = inBrindas("Mairie", 45.718901, 4.701234);
const GARE = inBrindas("Gare", 45.710009, 4.690001);
const PLACES = [LILAS, MAIRIE, GARE, inBrindas("Stade", 45.7151, 4.6952), inBrindas("Église", 45.7193, 4.7004)];

const form = (page: Page) => page.getByRole("dialog", { name: FR.offer });
const place = (page: Page, label: string) => form(page).getByRole("combobox", { name: label, exact: true });
const list = (page: Page, label: string) => form(page).getByRole("listbox", { name: `Propositions pour ${label}`, exact: true });
const options = (page: Page, label: string) => list(page, label).getByRole("option");
/** The field's `status` region: the departure's comes first in the form, the drop-off's after. */
const status = (page: Page, nth: 0 | 1) => form(page).getByRole("status").nth(nth);
const positionLines = (page: Page) => form(page).getByText(/^Position : /);
const removeButton = (page: Page, label: string) => form(page).getByRole("button", { name: `Retirer la position (${label})`, exact: true });
const submit = (page: Page) => form(page).getByRole("button", { name: "Valider", exact: true });

/** « Proposer une voiture » on the event's Aller, for a new driver, Marc. */
async function openForm(page: Page, eventId: string) {
  await page.goto(`/e/${eventId}`);
  await page.getByRole("tabpanel").getByRole("button", { name: FR.offer, exact: true }).click();
  await expect(form(page)).toBeVisible();
  await form(page).getByLabel(FR.firstName, { exact: true }).fill("Marc");
}

/** « Je ramène aussi des personnes »: the drop-off place unfolds, under « Au retour ». */
async function driveBack(page: Page) {
  await form(page).getByRole("radiogroup", { name: FR.retour }).getByRole("radio", { name: FR.drive, exact: true }).check();
  await expect(place(page, FR.dropOff)).toBeVisible();
}

/** `text` typed in `label`, answered with `places`, and the option `chosen` tapped. */
async function choose(page: Page, label: string, places: { feature: PhotonFeature }[], chosen = 0) {
  const text = textOf(label === FR.departure ? "Mair" : "Gare");
  await answerFor(text, { features: places.map(({ feature }) => feature) });
  await place(page, label).fill(text);
  await expect(options(page, label)).toHaveCount(places.length);
  await options(page, label).nth(chosen).click();
}

/** The cars of the event, as stored, Aller first: their place's text and position. */
async function stored(page: Page, db: Db, eventId: string) {
  await expect(form(page)).toHaveCount(0);
  return db
    .selectFrom("ride")
    .select(["leg", "location", "location_lat", "location_lng"])
    .where("event_id", "=", eventId)
    .orderBy("leg")
    .execute();
}

/** Holds the offer whose request carries `marker` until `fail` answers it 500; `stop` holds no more. */
async function holdOffer(page: Page, marker: string) {
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

test.describe("the places of « Proposer une voiture », the event with a position", () => {
  test.use({ locale: "fr-FR", eventFields: { locationPosition: EVENT_AT } });

  test("AL4.1, AL4.4, AL1.9 (c), AL4.3: the event's area at 1 decimal; the sentence describes the place, after the position line; the car keeps the option's exact position", async ({
    page,
    db,
    seededEvent,
  }) => {
    const text = textOf("Mairie");
    await answerFor(text, { features: PLACES.map(({ feature }) => feature) });
    await openForm(page, seededEvent.id);
    await expect(place(page, FR.departure)).toHaveAccessibleDescription(FR.hint);

    await place(page, FR.departure).fill(text);
    await expect(options(page, FR.departure)).toHaveCount(5);
    await expect.poll(async () => (await requestsFor(text)).length).toBe(1);
    const query = new URLSearchParams((await requestsFor(text))[0].query);
    expect([query.get("lat"), query.get("lon")]).toEqual(["45.8", "4.7"]);

    await options(page, FR.departure).nth(1).click();
    await expect(place(page, FR.departure)).toHaveValue(MAIRIE.label);
    await expect(place(page, FR.departure)).toHaveAccessibleDescription(`Position : ${MAIRIE.label} ${FR.hint}`);
    await expect(status(page, 0)).toHaveText(FR.added);

    await submit(page).click();
    expect(await stored(page, db, seededEvent.id)).toEqual([{ leg: "aller", location: MAIRIE.label, location_lat: 45.7189, location_lng: 4.70123 }]);
  });

  test("AL3.6: the first keystroke after a choice takes the position, said once; a new choice gives one back; a paste counts as a keystroke; the car is saved without", async ({
    page,
    db,
    seededEvent,
  }) => {
    await openForm(page, seededEvent.id);
    await choose(page, FR.departure, [LILAS]);
    await expect(positionLines(page)).toHaveText([`Position : ${LILAS.label}`]);
    const said = await recordStatus(status(page, 0));

    await place(page, FR.departure).press("End");
    await place(page, FR.departure).press("Backspace");
    await expect(positionLines(page)).toHaveCount(0);
    await expect(removeButton(page, FR.departure)).toHaveCount(0);
    await expect(place(page, FR.departure)).toHaveAccessibleDescription(FR.hint);
    await expect(status(page, 0)).toHaveText(FR.removed);
    await place(page, FR.departure).press("Backspace");
    expect(await said()).toEqual([FR.removed]);

    await choose(page, FR.departure, [MAIRIE]);
    await expect(positionLines(page)).toHaveText([`Position : ${MAIRIE.label}`]);
    await place(page, FR.departure).press("End");
    await page.keyboard.insertText(", parvis");
    await expect(positionLines(page)).toHaveCount(0);
    await expect(status(page, 0)).toHaveText(FR.removed);

    await submit(page).click();
    expect(await stored(page, db, seededEvent.id)).toEqual([{ leg: "aller", location: `${MAIRIE.label}, parvis`, location_lat: null, location_lng: null }]);
  });

  test("AL3.3, AL3.8: emptying a car's place takes its position and says « Position retirée. » once; emptied without a position, nothing", async ({ page, seededEvent }) => {
    await openForm(page, seededEvent.id);
    await choose(page, FR.departure, [GARE]);
    const said = await recordStatus(status(page, 0));

    await place(page, FR.departure).fill("");
    await expect(positionLines(page)).toHaveCount(0);
    await expect(status(page, 0)).toHaveText(FR.removed);
    await place(page, FR.departure).fill("Ga");
    await place(page, FR.departure).fill("");
    await choose(page, FR.departure, [GARE]);
    await expect(status(page, 0)).toHaveText(FR.added);
    // Nothing between the position gone and the next list.
    expect(await said()).toEqual([FR.removed, "1 proposition", FR.added]);
  });

  test("AL4.2, AL3.5, AL4.4: « Je ramène aussi des personnes »: the drop-off follows text and position, its own « Retirer » named; a keystroke in the departure takes both, said by the departure alone", async ({
    page,
    db,
    seededEvent,
  }) => {
    await openForm(page, seededEvent.id);
    await driveBack(page);
    await expect(place(page, FR.dropOff)).toHaveAccessibleDescription(FR.hint);
    await choose(page, FR.departure, [LILAS]);

    await expect(place(page, FR.dropOff)).toHaveValue(LILAS.label);
    await expect(positionLines(page)).toHaveText([`Position : ${LILAS.label}`, `Position : ${LILAS.label}`]);
    await expect(removeButton(page, FR.departure)).toBeVisible();
    await expect(removeButton(page, FR.dropOff)).toBeVisible();
    await expect(place(page, FR.dropOff)).toHaveAccessibleDescription(`Position : ${LILAS.label} ${FR.hint}`);
    const departureSaid = await recordStatus(status(page, 0));
    const dropOffSaid = await recordStatus(status(page, 1));

    await place(page, FR.departure).press("End");
    await place(page, FR.departure).press("Backspace");
    await expect(positionLines(page)).toHaveCount(0);
    await expect(place(page, FR.dropOff)).toHaveValue(LILAS.label.slice(0, -1));
    await expect(status(page, 0)).toHaveText(FR.removed);
    expect(await departureSaid()).toEqual([FR.removed]);
    expect(await dropOffSaid()).toEqual([]);

    // Still untouched, it follows the next choice too, position included.
    await choose(page, FR.departure, [MAIRIE]);
    await expect(place(page, FR.dropOff)).toHaveValue(MAIRIE.label);
    await expect(positionLines(page)).toHaveText([`Position : ${MAIRIE.label}`, `Position : ${MAIRIE.label}`]);
    expect(await dropOffSaid()).toEqual([]);

    await submit(page).click();
    expect(await stored(page, db, seededEvent.id)).toEqual([
      { leg: "aller", location: MAIRIE.label, location_lat: 45.7189, location_lng: 4.70123 },
      { leg: "retour", location: MAIRIE.label, location_lat: 45.7189, location_lng: 4.70123 },
    ]);
  });

  test("AL3.6, AL4.2: a keystroke in the drop-off takes its position, said there; touched, it no longer follows; « Retirer » of the departure leaves it", async ({
    page,
    db,
    seededEvent,
  }) => {
    await openForm(page, seededEvent.id);
    await driveBack(page);
    await choose(page, FR.departure, [LILAS]);
    const departureSaid = await recordStatus(status(page, 0));
    const dropOffSaid = await recordStatus(status(page, 1));

    await place(page, FR.dropOff).press("End");
    await place(page, FR.dropOff).press("Backspace");
    await expect(removeButton(page, FR.dropOff)).toHaveCount(0);
    await expect(positionLines(page)).toHaveText([`Position : ${LILAS.label}`]);
    await expect(status(page, 1)).toHaveText(FR.removed);
    expect(await dropOffSaid()).toEqual([FR.removed]);
    expect(await departureSaid()).toEqual([]);

    await choose(page, FR.departure, [MAIRIE]);
    await expect(place(page, FR.dropOff)).toHaveValue(LILAS.label.slice(0, -1));
    await choose(page, FR.dropOff, [GARE]);
    await removeButton(page, FR.departure).click();
    await expect(place(page, FR.departure)).toBeFocused();
    await expect(positionLines(page)).toHaveText([`Position : ${GARE.label}`]);

    await submit(page).click();
    expect(await stored(page, db, seededEvent.id)).toEqual([
      { leg: "aller", location: MAIRIE.label, location_lat: null, location_lng: null },
      { leg: "retour", location: GARE.label, location_lat: 45.71001, location_lng: 4.69 },
    ]);
  });

  test("AL1.5: Tab or a tap elsewhere closes the list, the text kept; Escape closes the list alone, the focus in the field; a second Escape closes the sheet", async ({
    page,
    seededEvent,
  }) => {
    const text = textOf("Gare");
    await answerFor(text, { features: [GARE.feature, MAIRIE.feature] });
    await openForm(page, seededEvent.id);
    const departure = place(page, FR.departure);

    await departure.fill(text);
    await expect(options(page, FR.departure)).toHaveCount(2);
    await departure.press("Tab");
    await expect(list(page, FR.departure)).toBeHidden();
    await expect(departure).toHaveValue(text);

    await departure.press("ArrowDown");
    await expect(options(page, FR.departure)).toHaveCount(2);
    await form(page).getByRole("heading", { name: FR.offer }).click();
    await expect(list(page, FR.departure)).toBeHidden();
    await expect(departure).toHaveValue(text);

    await departure.focus();
    await departure.press("ArrowDown");
    await expect(departure).toHaveAttribute("aria-expanded", "true");
    await departure.press("Escape");
    await expect(list(page, FR.departure)).toBeHidden();
    // Still visible while it slides out: Radix says at once whether it is closing.
    await expect(form(page)).toHaveAttribute("data-state", "open");
    await expect(departure).toHaveValue(text);
    await expect(departure).toBeFocused();

    await departure.press("Escape");
    await expect(form(page)).toHaveCount(0);
  });

  test("AL5.4, AL5.5: while the offer is sending, nothing is asked, no list opens and « Retirer » does nothing; failed, the form keeps the places and the position sent", async ({
    page,
    db,
    seededEvent,
  }) => {
    const marker = textOf("Coffre");
    const later = textOf("Gare routière");
    await page.clock.install();
    const offer = await holdOffer(page, marker);
    const sent = searches(page);
    await openForm(page, seededEvent.id);
    await form(page).getByLabel(FR.note, { exact: true }).fill(marker);
    await driveBack(page);
    await choose(page, FR.departure, [LILAS]);
    const before = sent.length;

    // Enter in the drop-off sends the form while its pause is under way.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
    await place(page, FR.dropOff).fill(later);
    await place(page, FR.dropOff).press("Enter");
    await offer.sent;
    await page.clock.runFor(5_000);
    await place(page, FR.dropOff).pressSequentially(" bis");
    await page.clock.runFor(5_000);
    await expect(removeButton(page, FR.departure)).toHaveAttribute("aria-disabled", "true");
    // Tapped: a button `aria-disabled` takes the tap, which Playwright's click would wait out.
    await removeButton(page, FR.departure).dispatchEvent("click");
    await page.clock.resume();

    await offer.fail();
    await expect(form(page).getByRole("alert")).toHaveText(FR.failed);
    expect(sent.length - before).toBe(0);
    await expect(list(page, FR.dropOff)).toBeHidden();
    await expect(place(page, FR.departure)).toHaveValue(LILAS.label);
    await expect(positionLines(page)).toHaveText([`Position : ${LILAS.label}`]);
    await expect(place(page, FR.dropOff)).toHaveValue(`${later} bis`);
    await expect(removeButton(page, FR.departure)).not.toHaveAttribute("aria-disabled");
    expect((await requestsFor(later)).length + (await requestsFor(`${later} bis`)).length).toBe(0);

    await offer.stop();
    await submit(page).click();
    expect(await stored(page, db, seededEvent.id)).toEqual([
      { leg: "aller", location: LILAS.label, location_lat: 45.72123, location_lng: 4.69876 },
      { leg: "retour", location: `${later} bis`, location_lat: null, location_lng: null },
    ]);
  });

  test("v3 while sending: a keystroke in a car's place still takes its position, said; failed, the form holds the text typed without a position", async ({
    page,
    db,
    seededEvent,
  }) => {
    const marker = textOf("Coffre");
    const offer = await holdOffer(page, marker);
    await openForm(page, seededEvent.id);
    await form(page).getByLabel(FR.note, { exact: true }).fill(marker);
    await choose(page, FR.departure, [GARE]);
    const said = await recordStatus(status(page, 0));

    await submit(page).click();
    await offer.sent;
    await place(page, FR.departure).press("End");
    await place(page, FR.departure).press("Backspace");
    await expect(positionLines(page)).toHaveCount(0);
    await expect(status(page, 0)).toHaveText(FR.removed);
    await offer.fail();
    await expect(form(page).getByRole("alert")).toHaveText(FR.failed);
    await expect(place(page, FR.departure)).toHaveValue(GARE.label.slice(0, -1));
    await expect(positionLines(page)).toHaveCount(0);
    expect(await said()).toEqual([FR.removed]);

    await offer.stop();
    await submit(page).click();
    expect(await stored(page, db, seededEvent.id)).toEqual([{ leg: "aller", location: GARE.label.slice(0, -1), location_lat: null, location_lng: null }]);
  });
});

test.describe("the places of « Proposer une voiture », the event without a position", () => {
  test.use({ locale: "fr-FR" });

  test("AL4.1: without the event's position, Photon receives neither lat nor lon", async ({ page, seededEvent }) => {
    const text = textOf("Mairie");
    await openForm(page, seededEvent.id);
    await place(page, FR.departure).fill(text);
    await expect.poll(async () => (await requestsFor(text)).length).toBe(1);
    const query = new URLSearchParams((await requestsFor(text))[0].query);
    expect([query.has("lat"), query.has("lon")]).toEqual([false, false]);
  });
});

test.describe("the drop-off place at the bottom of the sheet, in a window of 360 × 420", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 420 } });

  /** The list, its options and its footer: the element that holds the listbox. */
  const popup = (page: Page) => list(page, FR.dropOff).locator("..");

  /** At most the height left under the field, less 8 px, and wholly in the window. */
  async function expectFits(page: Page, popupBox: Locator) {
    const field = (await place(page, FR.dropOff).boundingBox())!;
    const box = (await popupBox.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(field.y + field.height);
    expect(box.height).toBeLessThanOrEqual(420 - (field.y + field.height) - 8 + 0.5);
    await expect(popupBox).toBeInViewport({ ratio: 1 });
  }

  /** How far the drop-off's field, its label first, is under the top of what the sheet shows. */
  const underTop = (page: Page) =>
    form(page)
      .getByText(FR.dropOff, { exact: true })
      .evaluate((label) => {
        const sheet = label.closest('[role="dialog"]')!;
        return label.getBoundingClientRect().top - (sheet.getBoundingClientRect().top + sheet.clientTop);
      });

  test("AL1.11: the drop-off's list opens under the field, whole in the window, five options and the footer in it", async ({ page, seededEvent }) => {
    const text = textOf("Gare de Br");
    await answerFor(text, { features: PLACES.map(({ feature }) => feature) });
    await openForm(page, seededEvent.id);
    await driveBack(page);
    expect(await underTop(page)).toBeGreaterThan(100);
    await place(page, FR.dropOff).fill(text);
    await expect(options(page, FR.dropOff)).toHaveCount(5);

    // The field has moved to the top of what the sheet shows, the list under it.
    await expect.poll(() => underTop(page)).toBeCloseTo(0, 0);
    await expectFits(page, popup(page));
    for (const option of await options(page, FR.dropOff).all()) await expect(option).toBeInViewport({ ratio: 1 });
    await expect(popup(page).getByText("Ou gardez votre texte tel quel.")).toBeInViewport({ ratio: 1 });
  });

  test("AL1.11: longer labels: the list keeps to the window, and scrolls in itself", async ({ page, seededEvent }) => {
    const text = textOf("Gare de Br");
    const long = (n: number) => namedPlace(`Gare de Brignais, quai ${n}, devant le grand parking couvert des voyageurs et des cars de la région`, 45.7 + n / 100, 4.7, "69126", "Brignais");
    await answerFor(text, { features: [1, 2, 3, 4, 5].map((n) => long(n).feature) });
    await openForm(page, seededEvent.id);
    await driveBack(page);
    await place(page, FR.dropOff).fill(text);
    await expect(options(page, FR.dropOff)).toHaveCount(5);

    await expectFits(page, popup(page));
    expect(await popup(page).evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  });
});
