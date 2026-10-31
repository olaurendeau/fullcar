import type { Locator, Page, Request } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { isPersonalToken } from "@/domain/personal-token";
import { bar, failActions, holdActions, holdClose, holdFirst, holdToken, newToken, watchAlerts } from "./device";
import { DRIVER_PHONE, fillDriver, numbersHidden } from "./driver";
import { expect, leaveNoToken, test } from "./fixtures";

leaveNoToken();

// #90: « Proposer une voiture » on each leg, its form in a bottom sheet (R4).

type Db = Kysely<Database>;

const FR = {
  offer: "Proposer une voiture",
  add: "Ajouter une personne",
  driver: "Qui conduit ?",
  newDriver: "Une nouvelle personne",
  firstName: "Prénom",
  location: { aller: "Lieu de départ", retour: "Lieu de dépose" },
  time: "Heure de départ",
  timeHint: "Le samedi 12 décembre 2026",
  seats: "Places, sans compter qui conduit",
  seatsHint: "De 1 à 8.",
  note: "Note (facultatif)",
  noteHint: "Ce que les personnes à bord doivent savoir.",
  storageTitle: "Cet appareil ne pourra pas s’en souvenir",
  storageBody: "Votre navigateur bloque le stockage : après la fermeture de la page, cette voiture et la personne qui conduit ne pourront plus être modifiées depuis cet appareil.",
  required: "Champ requis.",
  // Under each place of a car, after its error (place-autocomplete, AL1.9 (b), AL4.4).
  placeHint: "Visible par toutes les personnes qui ont le lien.",
  // The end of « Aucune proposition… » and of « Propositions indisponibles… », under a place field.
  placeAnswered: "Votre texte sera gardé tel quel.",
  seatsError: "De 1 à 8 places.",
  chooseDriver: "Choisissez qui conduit.",
  failed: "Une erreur est survenue et rien n’a changé. Réessayez dans un instant.",
  offline: "Action impossible, vérifiez la connexion",
};
/** In the bar, a failure names who drives and the leg offered (C11.11, #226). */
const BAR_FAILED = "La voiture de Marc pour l’aller n’a pas été proposée. Une erreur est survenue : réessayez dans un instant.";

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass();
}

const panel = (page: Page) => page.getByRole("tabpanel");
const offerButton = (scope: Page | Locator) => scope.getByRole("button", { name: FR.offer, exact: true });
const form = (page: Page) => page.getByRole("dialog", { name: FR.offer });
const submit = (page: Page) => form(page).getByRole("button", { name: "Valider" });
const field = (page: Page, label: string) => form(page).getByLabel(label, { exact: true });
const section = (page: Page) => page.getByRole("region", { name: "Vos inscriptions" });
const toggle = (page: Page) => section(page).getByRole("button", { name: /^Vos inscriptions/ });
/** The choices of « Qui conduit ? », as their labels read: the radios' own text is empty. */
const radioNames = (scope: Locator) => scope.getByRole("radio").evaluateAll((radios) => radios.map((radio) => radio.closest("label")?.textContent ?? ""));
const car = (scope: Page | Locator, driver: string) => scope.getByRole("article", { name: `Voiture de ${driver}` });
const freeSeats = (scope: Page | Locator) => scope.getByRole("button", { name: /^Place libre : / });
const withoutCar = (scope: Locator) => scope.getByRole("region", { name: "Sans voiture" }).getByRole("listitem");
/** A failure while the form is open is said in the form, which stays open. */
const failure = (page: Page) => form(page).getByRole("alert");
const alerts = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });

/** « Vos inscriptions » with `firstName` alone, who drives: folded, nothing to do (v4-3), then unfolded to read it. */
async function unfold(page: Page, firstName: string) {
  await expect(toggle(page)).toContainText("1 personne · tout le monde a une place");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await toggle(page).click();
  await expect(section(page).getByRole("rowheader")).toHaveText([firstName]);
}

/** Opens the form from the active tab: the button waits, inactive, until the device is known (C5.9). */
async function openForm(page: Page) {
  await offerButton(panel(page)).click();
  await expect(form(page)).toBeVisible();
}

/**
 * Types `text` in a place field, then waits for its answer, none from the fake Photon: « Aucune
 * proposition… », or « indisponibles » past 3 s. Its line, under the field, moves « Valider » 24 px
 * down, more than half its height: a click aimed before it lands above the button (#546). Once
 * there, the line stays when the focus leaves.
 */
async function fillPlace(page: Page, label: string, text: string) {
  const input = field(page, label);
  await input.fill(text);
  await expect(input.locator("xpath=ancestor::div[2]").locator("p", { hasText: FR.placeAnswered })).toBeVisible();
}

/** Opens the form, and fills it for Marc's car from the Mairie de Vitré. */
async function fillOffer(page: Page) {
  await openForm(page);
  await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
  await fillPlace(page, FR.location.aller, "Mairie de Vitré");
}

/** The offers the page sends: server actions whose body carries `marker`. */
function offers(page: Page, marker: string): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-action"] && request.postData()?.includes(marker)) sent.push(request);
  });
  return sent;
}

const rides = async (db: Db, eventId: string) => db.selectFrom("ride").select(["leg", "location"]).where("event_id", "=", eventId).execute();

/** The device holds `names`, each with a number to drive, with their token in the page's `localStorage`. */
async function device(db: Db, page: Page, eventId: string, names: string[]) {
  const token = newToken();
  const ids: Record<string, string> = {};
  for (const firstName of names) ids[firstName] = (await seedPerson(db, eventId, { firstName, phone: DRIVER_PHONE }, token)).id;
  await holdToken(page, eventId, token);
  return ids;
}

const place = (db: Db, eventId: string, personId: string, leg: Leg, rideId: string | null) => seedPlacement(db, { personId, eventId, leg, rideId });

/** Where `names` are in the active tab's panel: buttons by their text, cars by « car ». */
const order = (page: Page): Promise<string[]> =>
  panel(page).evaluate((root) => Array.from(root.querySelectorAll("button, article"), (node) => (node.tagName === "ARTICLE" ? "car" : node.textContent ?? "")));

test.describe("offer a car", () => {
  test.use({ locale: "fr-FR" });

  test("C1.1, C9.6: both actions on each leg, before 15 cars, with no person on the device", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    for (let at = 0; at < 15; at++) {
      const driver = await seedPerson(db, id, { firstName: `Pilote ${at}` });
      await seedRide(db, id, driver.id);
    }
    await page.goto(`/e/${id}`);
    await expect(offerButton(panel(page))).toBeEnabled();
    const actions = await order(page);
    expect(actions.slice(0, 2)).toEqual([FR.add, FR.offer]);
    expect(actions.filter((name) => name === "car")).toHaveLength(15);
    expect((await offerButton(panel(page)).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // The empty Retour: its empty state, under both actions.
    await selectTab(page, "Retour");
    await expect(panel(page).getByRole("button")).toHaveText([FR.add, FR.offer]);
    await expect(offerButton(panel(page))).toBeEnabled();
  });

  test("C4.1, C4.2, C4.4: four actions, a car with 3 free seats on this leg only, a driver of the device", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const seen = { stored: false, carried: false, inUrl: true };
    await page.route("**/e/**", async (route) => {
      const request = route.request();
      if (request.headers()["next-action"] && request.postData()?.includes("Mairie de Vitré")) {
        const stored = await page.evaluate((key) => localStorage.getItem(key) ?? "", `fullcar:personal-token:${id}`);
        seen.stored = isPersonalToken(stored);
        seen.carried = seen.stored && (request.postData() ?? "").includes(stored);
        seen.inUrl = seen.stored && request.url().includes(stored);
      }
      await route.continue();
    });
    await page.goto(`/e/${id}`);

    // « Proposer une voiture », the first name, the place, « Valider ».
    await openForm(page);
    // Without a person on the device: no choice, the new person's fields directly.
    await expect(form(page).getByRole("radiogroup", { name: FR.driver })).toHaveCount(0);
    await expect(form(page).getByRole("group", { name: FR.driver })).toBeVisible();
    await expect(form(page)).not.toContainText(FR.storageTitle);
    await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
    await fillPlace(page, FR.location.aller, "Mairie de Vitré");
    await submit(page).click();

    await expect(form(page)).toHaveCount(0);
    await expect(offerButton(panel(page))).toBeFocused();
    await expect(freeSeats(car(panel(page), "Marc"))).toHaveCount(3);
    // The token was stored before the request left, which carried it in its body, not its URL (C1.5).
    expect(seen).toEqual({ stored: true, carried: true, inUrl: false });
    // Marc is the device's, and not concerned by the retour (C4.4).
    await unfold(page, "Marc");
    expect(await section(page).locator("tbody td").allTextContents()).toEqual(["Conduit", "Ne fait pas le retour"]);
    // C4.2: on this leg only.
    await selectTab(page, "Retour");
    await expect(panel(page).getByRole("article")).toHaveCount(0);
    expect(await rides(db, id)).toEqual([{ leg: "aller", location: "Mairie de Vitré" }]);

    await page.reload();
    await unfold(page, "Marc");
  });

  test("R4, C4.3, C1.14: without localStorage, a warning, the fields, then a card with all they say", async ({ page, seededEvent }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      }),
    );
    await page.goto(`/e/${seededEvent.id}`);
    await selectTab(page, "Retour");
    await openForm(page);
    await expect(form(page)).toContainText(FR.storageTitle);
    await expect(form(page)).toContainText(FR.storageBody);
    await expect(field(page, FR.firstName)).toBeFocused();
    await expect(field(page, FR.location.retour)).toBeVisible();
    await expect(field(page, FR.time)).toHaveValue("18:00");
    await expect(field(page, FR.time)).toHaveAccessibleDescription(FR.timeHint);
    await expect(field(page, FR.seats)).toHaveValue("3");
    await expect(field(page, FR.seats)).toHaveAccessibleDescription(FR.seatsHint);
    await expect(field(page, FR.note)).toHaveAccessibleDescription(FR.noteHint);

    await fillDriver(form(page), { firstName: "Karim", phone: DRIVER_PHONE });
    await fillPlace(page, FR.location.retour, "Place des Lices");
    await field(page, FR.time).fill("18:30");
    await field(page, FR.seats).fill("2");
    await field(page, FR.note).fill("Coffre plein, pas de gros sac.");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);

    const karim = car(panel(page), "Karim");
    await numbersHidden(() => expect(karim).toContainText("Place des Lices"));
    await expect(karim.locator("time")).toHaveText("18:30");
    await numbersHidden(() => expect(karim).toContainText("Coffre plein, pas de gros sac."));
    await expect(freeSeats(karim)).toHaveCount(2);
    // For this page only: Karim is the device's until it closes.
    await unfold(page, "Karim");
  });

  test("C4.5, C4.6, C9.4: a passenger who drives frees her seat, one without a car leaves the list", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const marc = await seedPerson(db, id, { firstName: "Marc" });
    const marcsCar = await seedRide(db, id, marc.id);
    const { Léa: lea, Tom: tom } = await device(db, page, id, ["Léa", "Tom"]);
    await place(db, id, lea, "aller", marcsCar);
    await place(db, id, tom, "aller", null);
    await place(db, id, lea, "retour", null);
    await page.goto(`/e/${id}`);
    await expect(freeSeats(car(panel(page), "Marc"))).toHaveCount(2);

    // Two persons can drive: none is chosen.
    await openForm(page);
    const choices = form(page).getByRole("radiogroup", { name: FR.driver });
    expect(await radioNames(choices)).toEqual(["Léa", "Tom", FR.newDriver]);
    for (const radio of await choices.getByRole("radio").all()) await expect(radio).not.toBeChecked();
    await expect(field(page, FR.firstName)).toHaveCount(0);
    await choices.getByRole("radio", { name: "Léa" }).check();
    await fillPlace(page, FR.location.aller, "Gare de Vitré");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(freeSeats(car(panel(page), "Marc"))).toHaveCount(3);
    await expect(freeSeats(car(panel(page), "Léa"))).toHaveCount(3);
    // Her retour is as it was: without a car (review of #200).
    const retour = db.selectFrom("placement").select("ride_id").where("person_id", "=", lea).where("leg", "=", "retour");
    expect(await retour.execute()).toEqual([{ ride_id: null }]);

    // Léa drives on this leg: Tom alone can, and is chosen (C4.6).
    await openForm(page);
    expect(await radioNames(choices)).toEqual(["Tom", FR.newDriver]);
    await expect(choices.getByRole("radio", { name: "Tom" })).toBeChecked();
    await fillPlace(page, FR.location.aller, "Église");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(withoutCar(panel(page))).toHaveCount(0);
    // The banner and the pill follow (C9.4).
    await expect(page.getByRole("tab", { name: /^Aller/ })).toHaveText("Aller");
    await expect(panel(page).getByRole("status")).toHaveText("Tout le monde a une place · 9 places libres");

    // Everyone drives on this leg: only a new person.
    await openForm(page);
    await expect(form(page).getByRole("radiogroup", { name: FR.driver })).toHaveCount(0);
    await expect(field(page, FR.firstName)).toBeVisible();
  });

  test("Léa, the only person of the device, drives on this leg from another tab: the sheet unblocks", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Léa"]);
    await page.goto(`/e/${id}`);
    await openForm(page);
    await expect(form(page).getByRole("radio", { name: "Léa" })).toBeChecked();
    await fillPlace(page, FR.location.aller, "Gare");
    await seedRide(db, id, lea);
    await submit(page).click();
    await expect(failure(page)).toHaveText(FR.failed);
    await expect(submit(page)).toBeFocused();
    // Nobody else can drive: a new person, and her fields.
    await expect(form(page).getByRole("radiogroup", { name: FR.driver })).toHaveCount(0);
    await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await numbersHidden(() => expect(car(panel(page), "Marc")).toContainText("Gare"));
  });

  test("Léa, chosen, drives on this leg from another tab while Tom can still: nobody is chosen, as on opening", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Léa", "Tom"]);
    await page.goto(`/e/${id}`);
    await openForm(page);
    const choices = form(page).getByRole("radiogroup", { name: FR.driver });
    await choices.getByRole("radio", { name: "Léa" }).check();
    await fillPlace(page, FR.location.aller, "Gare");
    await seedRide(db, id, lea);
    await submit(page).click();
    await expect(failure(page)).toHaveText(FR.failed);
    expect(await radioNames(choices)).toEqual(["Tom", FR.newDriver]);
    for (const radio of await choices.getByRole("radio").all()) await expect(radio).not.toBeChecked();
    await expect(choices).not.toHaveAttribute("aria-invalid");
    // At the next « Valider », as on opening: the choice is asked for, nothing is sent.
    await submit(page).click();
    await expect(choices).toHaveAccessibleDescription(FR.chooseDriver);
    await expect(choices.getByRole("radio", { name: "Tom" })).toBeFocused();
    expect((await rides(db, id)).filter((ride) => ride.location === "Gare")).toEqual([]);
  });

  test("C4.7: errors by field, the focus on the first, values kept; nothing sent", async ({ context, db, page, seededEvent }) => {
    const { id } = seededEvent;
    await device(db, page, id, ["Claire", "Léa"]);
    const sent = offers(page, "Laisser la place");
    await page.goto(`/e/${id}`);
    await openForm(page);
    await field(page, FR.seats).fill("");
    await field(page, FR.note).fill("Laisser la place");
    await submit(page).click();

    const choices = form(page).getByRole("radiogroup", { name: FR.driver });
    await expect(choices).toHaveAccessibleDescription(FR.chooseDriver);
    await expect(choices).toHaveAttribute("aria-invalid", "true");
    await expect(choices.getByRole("radio", { name: "Claire" })).toBeFocused();
    await expect(field(page, FR.location.aller)).toHaveAccessibleDescription(`${FR.required} ${FR.placeHint}`);
    await expect(field(page, FR.location.aller)).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, FR.seats)).toHaveAccessibleDescription(`${FR.required} ${FR.seatsHint}`);
    await expect(field(page, FR.note)).toHaveValue("Laisser la place");

    // A new person, without a first name; too many seats.
    await choices.getByRole("radio", { name: FR.newDriver }).check();
    await fillPlace(page, FR.location.aller, "Gare");
    await field(page, FR.seats).fill("9");
    await submit(page).click();
    await expect(choices).not.toHaveAttribute("aria-invalid");
    await expect(field(page, FR.firstName)).toHaveAccessibleDescription(FR.required);
    await expect(field(page, FR.firstName)).toBeFocused();
    await expect(field(page, FR.seats)).toHaveAccessibleDescription(`${FR.seatsError} ${FR.seatsHint}`);
    await expect(field(page, FR.location.aller)).not.toHaveAttribute("aria-invalid");
    // Taller than the screen, the sheet scrolls inside it: its title is never out of reach.
    const sheet = (await form(page).boundingBox())!;
    expect(sheet.y).toBeGreaterThanOrEqual(0);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await form(page).getByRole("heading", { name: FR.offer }).scrollIntoViewIfNeeded();
    await expect(form(page).getByRole("heading", { name: FR.offer })).toBeInViewport();

    await fillDriver(form(page), { firstName: "Marc", phone: DRIVER_PHONE });
    await submit(page).click();
    await expect(field(page, FR.seats)).toBeFocused();
    await expect(field(page, FR.firstName)).toHaveValue("Marc");
    await expect(field(page, FR.location.aller)).toHaveValue("Gare");
    // Corrected, then sent offline: the errors are cleared before sending.
    await field(page, FR.seats).fill("3");
    await context.setOffline(true);
    await submit(page).click();
    await expect(field(page, FR.seats)).toHaveAccessibleDescription(FR.seatsHint);
    expect(sent.length).toBe(0);
    expect(await rides(db, id)).toEqual([]);
  });

  test("C4.8: two quick taps send one request, and « Valider » is inactive meanwhile", async ({ db, page, seededEvent }) => {
    const sent = offers(page, "Mairie de Vitré");
    await page.goto(`/e/${seededEvent.id}`);
    await fillOffer(page);
    const release = await holdActions(page);
    await submit(page).dblclick();
    await expect(submit(page)).toBeDisabled();
    release();
    await expect(form(page)).toHaveCount(0);
    await expect(car(panel(page), "Marc")).toBeVisible();
    expect(sent.length).toBe(1);
    expect(await rides(db, seededEvent.id)).toHaveLength(1);
  });

  test("C4.10: a response lost after the write, sent again, makes one car and one person, the device's", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    let lost = false;
    await page.route("**/e/**", async (route) => {
      const request = route.request();
      if (!lost && request.headers()["next-action"] && request.postData()?.includes("Mairie de Vitré")) {
        lost = true;
        // The request reaches the server and writes; its answer never reaches the page.
        await route.fetch();
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(`/e/${id}`);
    await fillOffer(page);
    await submit(page).click();
    await expect(failure(page)).toHaveText(FR.failed);
    await expect(field(page, FR.location.aller)).toHaveValue("Mairie de Vitré");

    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(alerts(page)).toHaveCount(0);
    await expect(car(panel(page), "Marc")).toBeVisible();
    expect(await rides(db, id)).toHaveLength(1);
    expect(await db.selectFrom("person").select("first_name").where("event_id", "=", id).execute()).toEqual([{ first_name: "Marc" }]);
    await page.reload();
    await unfold(page, "Marc");
  });

  test("offline, then a refusal in the open sheet: said there alone, « Valider » keeps the focus", async ({ context, page, seededEvent }) => {
    const sent = offers(page, "Mairie de Vitré");
    await page.goto(`/e/${seededEvent.id}`);
    await fillOffer(page);
    await context.setOffline(true);
    await submit(page).click();
    await expect(failure(page)).toHaveText(FR.offline);
    // Nothing sent, and no token drawn nor stored (C1.13).
    expect(sent.length).toBe(0);
    const keys = await page.evaluate((event) => Object.keys(localStorage).filter((key) => key.includes(event)), seededEvent.id);
    expect(keys).toEqual([]);

    await context.setOffline(false);
    await failActions(page);
    await submit(page).focus();
    await page.keyboard.press("Enter");
    await expect(failure(page)).toHaveText(FR.failed);
    await expect(submit(page)).toBeFocused();
    await expect(field(page, FR.firstName)).toHaveValue("Marc");
    await expect(bar(page)).toBeEmpty();
  });

  // Radix keeps a closing sheet mounted until its animation ends: held here until the answer has
  // come, however long it takes (#398). Reopened once closed, the sheet shows a new form, and the
  // one that sent is gone; reopened while it closes, the same form, which keeps what was typed.
  for (const when of ["closed", "closing", "reopened", "reopened while closing", "reopened while closing, then sent again"]) {
    const outcome = when.endsWith("again") ? "nothing left to say" : "said in the bar, once no sheet hides the page";
    test(`a refusal once the sheet is ${when}: ${outcome}`, async ({ page, seededEvent }) => {
      const closing = when.includes("closing");
      const answer = await holdFirst(page, "Mairie de Vitré", true);
      await page.goto(`/e/${seededEvent.id}`);
      const held = closing ? await page.addStyleTag({ content: holdClose }) : undefined;
      await fillOffer(page);
      await submit(page).click();
      await expect(submit(page)).toBeDisabled();
      await page.keyboard.press("Escape");
      if (closing) await expect(page.getByRole("dialog")).toHaveAttribute("data-state", "closed");
      else await expect(form(page)).toHaveCount(0);
      if (when === "reopened") await openForm(page);
      const seen = await watchAlerts(page);
      const responded = page.waitForResponse((response) => response.status() === 500);
      answer();
      await responded;
      if (closing) expect(await page.locator('[role="dialog"][data-state="closed"]').count()).toBe(1);
      if (when === "reopened") {
        // The new form says nothing and keeps its own values; Léa's car, offered from it, closes it.
        await expect(failure(page)).toHaveCount(0);
        await expect(field(page, FR.location.aller)).toHaveValue("");
        await fillDriver(form(page), { firstName: "Léa", phone: DRIVER_PHONE });
        await fillPlace(page, FR.location.aller, "Gare");
        await submit(page).click();
      } else if (when.startsWith("reopened")) {
        // Hidden from role queries while the sheet is mounted.
        await page.locator('[role="tabpanel"][data-state="active"] button', { hasText: FR.offer }).focus();
        await page.keyboard.press("Enter");
        await expect(form(page)).toHaveAttribute("data-state", "open");
        await expect(field(page, FR.location.aller)).toHaveValue("Mairie de Vitré");
        // From the keyboard: a click on « Valider » here was flaky in CI.
        await (when.endsWith("again") ? field(page, FR.location.aller).press("Enter") : page.keyboard.press("Escape"));
      }
      // Answered, and reopened if it is: the sheet may end its closing.
      await held?.evaluate((style) => style.parentNode?.removeChild(style));
      await expect(form(page)).toHaveCount(0);
      if (when.endsWith("again")) {
        await expect(car(panel(page), "Marc")).toBeVisible();
        await openForm(page);
        await expect(bar(page)).toBeEmpty();
      } else {
        await expect(bar(page)).toHaveText(BAR_FAILED);
        await expect(alerts(page)).toHaveText([BAR_FAILED]);
        await expect(offerButton(panel(page))).toBeFocused();
      }
      expect(await seen()).toEqual({ inSheet: false, barHidden: false });
    });
  }

  test("a success from a form closed since leaves the form opened meanwhile open", async ({ page, seededEvent }) => {
    const answer = await holdFirst(page, "Mairie de Vitré", false);
    await page.goto(`/e/${seededEvent.id}`);
    await fillOffer(page);
    await submit(page).click();
    await page.keyboard.press("Escape");
    await expect(form(page)).toHaveCount(0);
    await openForm(page);
    const second = await holdFirst(page, "Gare", false);
    await fillDriver(form(page), { firstName: "Léa", phone: DRIVER_PHONE });
    await fillPlace(page, FR.location.aller, "Gare");
    await submit(page).click();
    await expect(submit(page)).toBeDisabled(); // Sent after the first, not dropped (#208).
    answer();
    // Marc's car is behind the sheet, which stays open.
    await expect(page.locator("article", { hasText: "Mairie de Vitré" })).toHaveCount(1);
    await expect(form(page)).toHaveAttribute("data-state", "open");
    second();
    await expect(panel(page).getByRole("article")).toHaveCount(2);
  });

  test("C5.9: inactive while the read is delayed, then failed, until « Réessayer » succeeds", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Claire: claire } = await device(db, page, id, ["Claire"]);
    await seedRide(db, id, claire);
    const marc = await seedPerson(db, id, { firstName: "Marc" });
    await seedRide(db, id, marc.id, { leg: "retour" });
    // The first read, which carries the event's id, is held, then fails; the next goes through.
    const release = await holdFirst(page, id, true);
    /** On each tab: the free seats and both actions inactive, and a click opens no sheet; or all active. */
    async function everyTab(active: boolean) {
      for (const leg of ["Retour", "Aller"]) {
        await selectTab(page, leg);
        const add = panel(page).getByRole("button", { name: FR.add, exact: true });
        const controls = [...(await freeSeats(panel(page)).all()), add, offerButton(panel(page))];
        expect(controls).toHaveLength(5);
        for (const control of controls) {
          await (active ? expect(control).toBeEnabled() : expect(control).toBeDisabled());
          if (!active) await control.click({ force: true });
        }
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
    }

    await page.goto(`/e/${id}`);
    await expect(page.getByRole("status").filter({ hasText: "Chargement de vos inscriptions…" })).toBeVisible();
    await everyTab(false);
    release();
    const retry = page.getByRole("button", { name: "Réessayer" });
    await expect(retry).toBeVisible();
    await everyTab(false);
    await retry.click();
    await expect(section(page)).toBeVisible();
    await everyTab(true);
  });

  test("C9.7, C9.4: the main button where seats are missing, then the banner and the pill follow", async ({ db, page, seededEvent }) => {
    const { id } = seededEvent;
    const { Léa: lea } = await device(db, page, id, ["Léa"]);
    await place(db, id, lea, "aller", null);
    await place(db, id, (await seedPerson(db, id, { firstName: "Tom" })).id, "aller", null);
    await page.goto(`/e/${id}`);
    // C1.1 with a person on the device: the actions, then the cars.
    expect((await order(page)).slice(0, 2)).toEqual([FR.add, FR.offer]);
    const aller = page.getByRole("tab", { name: /^Aller/ });
    await expect(aller).toHaveText("Aller 2 sans voiture");
    await expect(panel(page).getByRole("status")).toHaveText("2 sans voiture · il manque 2 places");
    await expect(offerButton(panel(page))).toHaveAttribute("data-variant", "default");
    await selectTab(page, "Retour");
    await expect(offerButton(panel(page))).toHaveAttribute("data-variant", "outline");

    // Léa, the only person of the device, is chosen.
    await selectTab(page, "Aller");
    await openForm(page);
    await expect(form(page).getByRole("radio", { name: "Léa" })).toBeChecked();
    await fillPlace(page, FR.location.aller, "Gare de Vitré");
    await submit(page).click();
    await expect(form(page)).toHaveCount(0);
    await expect(aller).toHaveText("Aller 1 sans voiture");
    await expect(panel(page).getByRole("status")).toHaveText("1 sans voiture · 3 places libres");
    await expect(offerButton(panel(page))).toHaveAttribute("data-variant", "outline");
    await expect(withoutCar(panel(page))).toHaveText(["Tom"]);
  });

  // « Points de RDV » adds its section to the aller's form only (#889, RV1.1; e2e/ride-stops.spec.ts): the aller is compared
  // with the option off, the retour with it on.
  for (const { leg, stopsEnabled, title } of [
    { leg: "Aller", stopsEnabled: false, title: "C4.9: with boosters and participation on, the aller's form is the same as without" },
    { leg: "Retour", stopsEnabled: true, title: "C4.9: with the three options on, the retour's form is the same as without" },
  ]) {
    test(title, async ({ db, page, seededEvent }) => {
      const options = await seedEvent(db, { boostersEnabled: true, participationEnabled: true, stopsEnabled });
      try {
        const shown: string[][] = [];
        for (const id of [seededEvent.id, options.id]) {
          await page.goto(`/e/${id}`);
          if (leg === "Retour") await selectTab(page, "Retour");
          await openForm(page);
          shown.push([
            await form(page).innerText(),
            String(await form(page).locator("input, textarea, select, [role=radio], [role=checkbox]").count()),
          ]);
        }
        expect(shown[1]).toEqual(shown[0]);
      } finally {
        await db.deleteFrom("event").where("id", "=", options.id).execute();
      }
    });
  }
});
