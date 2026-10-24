import type { Locator, Page, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { messages } from "./device";
import { editEventInDb } from "./event-db";
import { leaveNoToken } from "./fixtures";
import { areaEditButton, expect, isAction, organiserPath, test } from "./organiser";
import { answerFor, requestsFor } from "./photon";
import { ECOLE, PLACES, SALLE, isSearch, searchedText, searches, textOf } from "./place-field";

/*
 * #432, epic #237 (place-autocomplete v6, « Modifier l’événement », states 6 (a) and 14, « Un lieu,
 * une valeur »): the event's place in « Modifier l’événement », with suggestions, against the slot's
 * fake Photon. The event's position stays when its text changes (D6). Each test runs under
 * `organiserTraffic` (O6.1, O2.10). Nothing here prints the token, the admin link or a number.
 */

leaveNoToken();

/** The seeded event's position (src/db/test-events.ts: « Gymnase des Gayeulles »), at 5 decimals. */
const AT = { lat: 48.13456, lng: -1.62345 };
const LOCATION = "Gymnase des Gayeulles";

const FR = {
  edit: "Modifier l’événement",
  saved: "Événement modifié. Personne n’est prévenu : pensez à le dire au groupe.",
  position: "Position enregistrée",
  remove: "Retirer la position (Lieu)",
  removed: "Position retirée.",
  changed: "L’événement vient d’être modifié depuis un autre appareil.",
  failed: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
  tooLong: "120 caractères au maximum.",
};

const editButton = (page: Page) => areaEditButton(page);
const sheet = (page: Page) => page.getByRole("dialog", { name: FR.edit });
const place = (page: Page) => sheet(page).getByRole("combobox", { name: "Lieu", exact: true });
const list = (page: Page) => sheet(page).getByRole("listbox", { name: "Propositions pour Lieu", exact: true });
const options = (page: Page) => list(page).getByRole("option");
const savedLine = (page: Page) => sheet(page).getByText(FR.position, { exact: true });
const removeButton = (page: Page) => sheet(page).getByRole("button", { name: FR.remove, exact: true });
const status = (page: Page) => sheet(page).getByRole("status");
const submit = (page: Page) => sheet(page).getByRole("button", { name: "Valider", exact: true });

/** The event as stored: its title, its place's text and its position. */
const stored = (db: Kysely<Database>, id: string) =>
  db.selectFrom("event").select(["title", "location", "location_lat", "location_lng"]).where("id", "=", id).executeTakeFirstOrThrow();

/** The organiser's page, brought to the front, then « Modifier l’événement » opened. */
async function openSheet(page: Page, path: string) {
  await page.bringToFront();
  await page.goto(path);
  await editButton(page).click();
  await expect(sheet(page)).toBeVisible();
}

/** « Valider », the change saved: the sheet closes and the bar says so. */
async function save(page: Page) {
  await submit(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(messages(page)).toHaveText([FR.saved]);
}

/** `text` typed in the place, answered with `count` of `PLACES`, the list open. */
async function typeAndList(page: Page, text: string, count: number) {
  await answerFor(text, { features: PLACES.slice(0, count).map(({ feature }) => feature) });
  await place(page).fill(text);
  await expect(options(page)).toHaveCount(count);
}

/** Holds the changes sent from now on until `fail` answers them 500; `stop` holds no more. */
async function holdEdits(page: Page) {
  const held: Route[] = [];
  const isAdmin = (url: URL) => url.pathname.endsWith("/admin");
  const hold = (route: Route) =>
    isAction(route.request()) && (route.request().postData() ?? "").includes('"allerDate"') ? void held.push(route) : route.fallback();
  await page.route(isAdmin, hold);
  return {
    held: () => held.length,
    fail: async () => {
      for (const route of held.splice(0)) await route.fulfill({ status: 500, contentType: "text/plain", body: "" });
    },
    stop: () => page.unroute(isAdmin, hold),
  };
}

test.describe("the place of « Modifier l’événement », the event with a position", () => {
  test.use({ locale: "fr-FR", eventFields: { locationPosition: AT } });

  test("AL5.1, AL5.2: the sheet opens with « Position enregistrée », which describes the place, and asks nothing; untouched, « Valider » sends nothing", async ({
    page,
    db,
    seededEvent,
  }) => {
    const sent = searches(page);
    await openSheet(page, organiserPath(seededEvent));
    await expect(place(page)).toHaveValue(LOCATION);
    await expect(savedLine(page)).toBeVisible();
    await expect(place(page)).toHaveAccessibleDescription(FR.position);
    await expect(removeButton(page)).toBeVisible();

    await submit(page).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(messages(page)).toHaveCount(0);
    expect(sent.length).toBe(0);
    expect(await stored(db, seededEvent.id)).toEqual({ title: "Tournoi de Rennes", location: LOCATION, location_lat: AT.lat, location_lng: AT.lng });
  });

  test("AL5.2: « Retirer » alone takes the line, says « Position retirée. », focuses the place; « Valider » saves the place without a position", async ({
    page,
    db,
    seededEvent,
  }) => {
    await openSheet(page, organiserPath(seededEvent));
    await removeButton(page).click();
    await expect(savedLine(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(FR.removed);
    await expect(place(page)).toBeFocused();
    await expect(place(page)).toHaveValue(LOCATION);

    await save(page);
    expect(await stored(db, seededEvent.id)).toEqual({ title: "Tournoi de Rennes", location: LOCATION, location_lat: null, location_lng: null });
  });

  test("AL3.7: the text changed keeps the line and the position; « Valider » saves the text changed with the position", async ({ page, db, seededEvent }) => {
    const text = textOf("Gymnase des Gayeulles, entrée B");
    await openSheet(page, organiserPath(seededEvent));
    await place(page).fill(text);
    await expect(savedLine(page)).toBeVisible();
    await expect(place(page)).toHaveAccessibleDescription(FR.position);

    await save(page);
    expect(await stored(db, seededEvent.id)).toEqual({ title: "Tournoi de Rennes", location: text, location_lat: AT.lat, location_lng: AT.lng });
  });

  test("AL1.9 (a): 121 characters after « Position enregistrée »: the error, then the position line, in the page and in the description", async ({
    page,
    seededEvent,
  }) => {
    await openSheet(page, organiserPath(seededEvent));
    await place(page).fill("Devant le gymnase des Gayeulles, côté parking, ".repeat(3).slice(0, 121));
    await submit(page).click();
    await expect(place(page)).toBeFocused();
    await expect(place(page)).toHaveAttribute("aria-invalid", "true");
    await expect(place(page)).toHaveAccessibleDescription(`${FR.tooLong} ${FR.position}`);
    const error = (await sheet(page).getByText(FR.tooLong, { exact: true }).boundingBox())!;
    expect(error.y + error.height).toBeLessThanOrEqual((await savedLine(page).boundingBox())!.y);
  });

  test("AL1.5: the list open, Escape closes it alone, the text kept and the focus in the place; a second Escape closes the sheet, nothing saved", async ({
    page,
    db,
    seededEvent,
  }) => {
    const text = textOf("Salle des f");
    await openSheet(page, organiserPath(seededEvent));
    await typeAndList(page, text, 2);
    await place(page).press("Escape");
    await expect(list(page)).toBeHidden();
    // Still visible while it slides out: Radix says at once whether it is closing.
    await expect(sheet(page)).toHaveAttribute("data-state", "open");
    await expect(place(page)).toHaveValue(text);
    await expect(place(page)).toBeFocused();

    await place(page).press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(editButton(page)).toBeFocused();
    expect(await stored(db, seededEvent.id)).toMatchObject({ location: LOCATION, location_lat: AT.lat });
  });

  test("AL5.4, AL5.5: while the change is sent, the place is read-only, asks nothing, opens no list awaited, and « Retirer » does nothing; failed, the text and the position stay", async ({
    page,
    db,
    seededEvent,
  }) => {
    const text = textOf("Gymnase, entrée");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature], delayMs: 1_500 });
    const edits = await holdEdits(page);
    await openSheet(page, organiserPath(seededEvent));
    const left = page.waitForRequest((request) => isSearch(request) && searchedText(request) === text);
    await place(page).fill(text);
    await left;
    // Abandoned when the form locks, or answered: either way, nothing more comes for it.
    const settled = Promise.race([
      page.waitForEvent("requestfailed", isSearch),
      page.waitForResponse((response) => isSearch(response.request())).then((response) => response.finished()),
    ]);
    const sent = searches(page);

    // Enter, the focus staying in the place: the answer awaited is dropped by the lock, not by a blur.
    await place(page).press("Enter");
    await expect.poll(edits.held).toBe(1);
    await settled;
    await expect(place(page)).toBeFocused();
    await expect(place(page)).toHaveAttribute("readonly", "");
    await place(page).pressSequentially(" bis");
    await expect(place(page)).toHaveValue(text);
    await place(page).press("ArrowDown");
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(removeButton(page)).toHaveAttribute("aria-disabled", "true");
    // Tapped: a button `aria-disabled` takes the tap, which Playwright's click would wait out.
    await removeButton(page).dispatchEvent("click");
    await expect(savedLine(page)).toBeVisible();

    await edits.fail();
    await expect(sheet(page).getByRole("alert")).toHaveText(FR.failed);
    await expect(place(page)).toHaveValue(text);
    await expect(savedLine(page)).toBeVisible();
    await expect(place(page)).not.toHaveAttribute("readonly");
    await expect(removeButton(page)).not.toHaveAttribute("aria-disabled");
    await expect(list(page)).toBeHidden();
    expect(sent.length).toBe(0);
    expect((await requestsFor(`${text} bis`)).length).toBe(0);

    await edits.stop();
    await save(page);
    expect(await stored(db, seededEvent.id)).toEqual({ title: "Tournoi de Rennes", location: text, location_lat: AT.lat, location_lng: AT.lng });
  });

  test("AL5.3, case 1: A removes the position and saves; B changes only the title: `changed`, nothing written, B's place the stored one without a line; again, B's title saved", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    const other = await context.newPage();
    await openSheet(page, organiserPath(seededEvent));
    await openSheet(other, organiserPath(seededEvent));

    await page.bringToFront();
    await removeButton(page).click();
    await save(page);

    await other.bringToFront();
    await sheet(other).getByLabel("Titre", { exact: true }).fill("Tournoi de Rennes U13");
    await submit(other).click();
    await expect(sheet(other).getByRole("alert").locator("p").first()).toHaveText(FR.changed);
    expect(await stored(db, seededEvent.id)).toEqual({ title: "Tournoi de Rennes", location: LOCATION, location_lat: null, location_lng: null });
    await expect(place(other)).toHaveValue(LOCATION);
    await expect(savedLine(other)).toHaveCount(0);
    await expect(sheet(other).getByLabel("Titre", { exact: true })).toHaveValue("Tournoi de Rennes U13");

    await save(other);
    expect(await stored(db, seededEvent.id)).toEqual({ title: "Tournoi de Rennes U13", location: LOCATION, location_lat: null, location_lng: null });
  });

  test("M6.1, review of #515: B chooses a suggestion while A saves a title: `changed`, B keeps its place, its line and its position; again, both saved", async ({
    page,
    context,
    db,
    seededEvent,
  }) => {
    const other = await context.newPage();
    await openSheet(page, organiserPath(seededEvent));
    await openSheet(other, organiserPath(seededEvent));
    await typeAndList(other, textOf("Salle des f"), 1);
    await options(other).first().click();
    await expect(sheet(other).getByText(`Position : ${SALLE.label}`, { exact: true })).toBeVisible();

    await page.bringToFront();
    await sheet(page).getByLabel("Titre", { exact: true }).fill("Tournoi de Rennes U13");
    await save(page);

    await other.bringToFront();
    await submit(other).click();
    await expect(sheet(other).getByRole("alert").locator("p").first()).toHaveText(FR.changed);
    await expect(place(other)).toHaveValue(SALLE.label);
    await expect(sheet(other).getByText(`Position : ${SALLE.label}`, { exact: true })).toBeVisible();
    await expect(sheet(other).getByLabel("Titre", { exact: true })).toHaveValue("Tournoi de Rennes U13");

    await save(other);
    expect(await stored(db, seededEvent.id)).toEqual({ title: "Tournoi de Rennes U13", location: SALLE.label, location_lat: 45.73791, location_lng: 4.65616 });
  });
});

test.describe("the place of « Modifier l’événement », the event without a position", () => {
  test.use({ locale: "fr-FR" });

  test("AL5.3: a place not touched takes the text and the position saved on another device together, « Position enregistrée »; again, saved", async ({
    page,
    db,
    seededEvent,
  }) => {
    await openSheet(page, organiserPath(seededEvent));
    await expect(savedLine(page)).toHaveCount(0);
    await editEventInDb(db, seededEvent.id, { location: "Salle Carrel", locationPosition: AT });

    await sheet(page).getByLabel("Titre", { exact: true }).fill("Tournoi de Rennes U13");
    await submit(page).click();
    await expect(sheet(page).getByRole("alert").locator("p").first()).toHaveText(FR.changed);
    await expect(place(page)).toHaveValue("Salle Carrel");
    await expect(savedLine(page)).toBeVisible();

    await save(page);
    expect(await stored(db, seededEvent.id)).toEqual({ title: "Tournoi de Rennes U13", location: "Salle Carrel", location_lat: AT.lat, location_lng: AT.lng });
  });
});

test.describe("the place of « Modifier l’événement » in a window of 360 × 420 (review of #526)", () => {
  test.use({ locale: "fr-FR", viewport: { width: 360, height: 420 } });

  /** At most the height left under the field, less 8 px, and wholly in the window. */
  async function expectFits(page: Page, popup: Locator) {
    const field = (await place(page).boundingBox())!;
    const box = (await popup.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(field.y + field.height);
    expect(box.height).toBeLessThanOrEqual(420 - (field.y + field.height) - 8 + 0.5);
    await expect(popup).toBeInViewport({ ratio: 1 });
  }

  for (const retour of [true, false]) {
    test(`AL1.11, ${retour ? "with" : "without"} the retour: the list opens under the place, whole in the window, five options and the footer in it`, async ({
      page,
      seededEvent,
    }) => {
      await openSheet(page, organiserPath(seededEvent));
      if (!retour) await sheet(page).getByRole("checkbox", { name: "Retour", exact: true }).click();
      await typeAndList(page, textOf("Gymnase des G"), 5);

      await expectFits(page, list(page).locator(".."));
      for (const option of await options(page).all()) await expect(option).toBeInViewport({ ratio: 1 });
      await expect(list(page).locator("..").getByText("Ou gardez votre texte tel quel.")).toBeInViewport({ ratio: 1 });
    });
  }
});
