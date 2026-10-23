import { randomUUID } from "node:crypto";
import type { Locator, Page, Request, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { expect, expectUrl, leaveNoToken, test } from "./fixtures";
import { answerFor, photonFeature, requestsFor, type PhotonFeature } from "./photon";

// Each creation lands on the organiser's link, its token in the fragment.
leaveNoToken();

// #428: the place field of « Créer un événement », with suggestions (place-autocomplete, states 1
// to 5, « Anatomie et clavier », « Les mots »), against the slot's fake Photon.

const FR = {
  place: "Lieu",
  list: "Propositions pour Lieu",
  remove: "Retirer la position (Lieu)",
  added: "Position ajoutée.",
  removed: "Position retirée.",
  none: "Aucune proposition. Votre texte sera gardé tel quel.",
  keepText: "Ou gardez votre texte tel quel.",
  source: "Propositions : © les contributeurs d’OpenStreetMap",
  create: "Créer",
  failed: "Impossible de créer l’événement. Vérifiez la connexion, puis réessayez.",
};

const NEW_EVENT = "/nouveau";
/** Where a new event lands: its id, then the organiser's token in the fragment. */
const ARRIVAL = /\/e\/([2-9A-HJ-NP-Za-km-z]{8})\/admin#[A-Za-z0-9_-]{22}$/;

/** A text of this test's own: the fake keeps its answers an hour, and the app its cache. */
function textOf(label: string) {
  return `${label} ${randomUUID()}`;
}

/** A named place in France, which the page writes « {name}, {postcode} {city} ». */
function namedPlace(name: string, lat: number, lon: number): { feature: PhotonFeature; label: string } {
  return {
    feature: photonFeature({ lat, lon, name, postcode: "69670", city: "Vaugneray", countrycode: "FR", country: "France" }),
    label: `${name}, 69670 Vaugneray`,
  };
}

const SALLE = namedPlace("Salle des fêtes", 45.737912, 4.656163);
const ECOLE = namedPlace("École primaire", 45.738456, 4.654321);
const MAIRIE = namedPlace("Mairie", 45.737011, 4.659876);
const PLACES = [SALLE, ECOLE, MAIRIE, namedPlace("Gymnase", 45.7391, 4.6512), namedPlace("Stade", 45.7402, 4.6623), namedPlace("Église", 45.7375, 4.6571)];

const place = (page: Page, name = FR.place) => page.getByRole("combobox", { name, exact: true });
const list = (page: Page, name = FR.list) => page.getByRole("listbox", { name, exact: true });
const options = (page: Page) => list(page).getByRole("option");
const status = (page: Page) => page.locator("form").getByRole("status");
const positionLine = (page: Page) => page.locator("form").getByText(/^Position : /);
const removeButton = (page: Page) => page.getByRole("button", { name: FR.remove, exact: true });
const createButton = (page: Page, name = FR.create) => page.getByRole("button", { name, exact: true });

/** The form, once hydrated: « Créer » stays inactive until then. */
async function openForm(page: Page, create = FR.create) {
  await page.goto(NEW_EVENT);
  await expect(createButton(page, create)).toBeEnabled({ timeout: 15_000 });
}

/** Every field but the place: a title, a start a week from the device's today, an end the same day. */
async function fillTheRest(page: Page, labels = { title: "Titre", date: "Date de début", time: "Heure de début", end: "Heure de fin" }) {
  const date = await page.evaluate(() => {
    const at = new Date();
    at.setDate(at.getDate() + 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  });
  await page.getByLabel(labels.title, { exact: true }).fill("Kermesse de l’école");
  await page.getByLabel(labels.date, { exact: true }).fill(date);
  await page.getByLabel(labels.time, { exact: true }).fill("10:00");
  await page.getByLabel(labels.end, { exact: true }).fill("18:00");
}

const isSearch = (request: Request) => new URL(request.url()).pathname === "/api/lieux";
const searchedText = (request: Request) => (request.postDataJSON() as { text: string }).text;

/** The page's requests to `/api/lieux`, from now on. */
function searches(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => isSearch(request) && sent.push(request));
  return sent;
}

/** The creation requests, a server action posted to the form's page, from now on. */
function creations(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === NEW_EVENT && request.headers()["next-action"]) sent.push(request);
  });
  return sent;
}

/** Holds the creations until `fail` answers them 500; `stop` holds no more. */
async function holdCreation(page: Page) {
  const held: Route[] = [];
  let arrived!: () => void;
  const sent = new Promise<void>((resolve) => (arrived = resolve));
  const isNewEvent = (url: URL) => url.pathname === NEW_EVENT;
  const hold = (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    held.push(route);
    arrived();
  };
  await page.route(isNewEvent, hold);
  return {
    sent,
    fail: async () => {
      for (const route of held.splice(0)) await route.fulfill({ status: 500, contentType: "text/plain", body: "" });
    },
    stop: () => page.unroute(isNewEvent, hold),
  };
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

/** The event just created, as stored: its place's text and position. */
async function created(page: Page, db: Kysely<Database>) {
  await expectUrl(page, ARRIVAL, "the organiser's link");
  const id = ARRIVAL.exec(page.url())![1];
  return db.selectFrom("event").select(["location", "location_lat", "location_lng"]).where("id", "=", id).executeTakeFirstOrThrow();
}

/** `text` typed, its suggestions shown: `count` of them. */
async function typeAndList(page: Page, text: string, count: number) {
  await place(page).fill(text);
  await expect(options(page)).toHaveCount(count);
}

/**
 * The contrast, as WCAG measures it, of the 3 px bar (`box-shadow`) of `option` with its
 * background, both drawn by the page on white to read their sRGB values.
 */
function barContrast(option: Locator): Promise<number> {
  return option.evaluate((element) => {
    const style = getComputedStyle(element);
    const bar = /^(\w+\([^)]*\)|#\w+|\w+)/.exec(style.boxShadow)?.[1] ?? "transparent";
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const luminance = (color: string) => {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(bar), luminance(style.backgroundColor)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  });
}

test.describe("the place field of « Créer un événement »", () => {
  test.use({ locale: "fr-FR" });

  test("AL1.1: under 3 characters after trim, no request; then one, 300 ms after the last of keystrokes less than 300 ms apart", async ({ page }) => {
    await page.clock.install();
    const sent = searches(page);
    await openForm(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));

    await place(page).pressSequentially("  Va");
    await page.clock.runFor(1_000);
    const rest = ["ugn", "eray ", randomUUID()];
    for (const part of rest) {
      await place(page).pressSequentially(part);
      await page.clock.runFor(250);
    }
    const next = page.waitForRequest(isSearch);
    await page.clock.runFor(50);
    const request = await next;

    // Anything « Va » or a part had sent would have come first.
    expect(searchedText(request)).toBe(`Va${rest.join("")}`);
    expect(sent.length).toBe(1);
    await expect.poll(async () => (await requestsFor(`Va${rest.join("")}`)).length).toBe(1);
  });

  test("AL1.2, AL1.6: 5 options of 44 px at most, the combobox expanded, the list named; Arrow down makes the first active, by aria-selected, aria-activedescendant and a bar of 3:1", async ({
    page,
  }) => {
    const text = textOf("Vaugn");
    await answerFor(text, { features: PLACES.map(({ feature }) => feature) });
    await openForm(page);
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await typeAndList(page, text, 5);

    await expect(place(page)).toHaveAttribute("aria-expanded", "true");
    await expect(place(page)).toHaveAttribute("aria-autocomplete", "list");
    await expect(status(page)).toHaveText("5 propositions");
    await expect(options(page)).toHaveText(PLACES.slice(0, 5).map(({ label }) => label));
    for (const option of await options(page).all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByText(FR.keepText)).toBeVisible();
    await expect(page.getByText(FR.source)).toBeVisible();
    await expect(options(page).first()).toHaveAttribute("aria-selected", "false");
    await expect(place(page)).not.toHaveAttribute("aria-activedescendant");

    await place(page).press("ArrowDown");
    await expect(options(page).first()).toHaveAttribute("aria-selected", "true");
    await expect(place(page)).toHaveAttribute("aria-activedescendant", (await options(page).first().getAttribute("id"))!);
    expect(await barContrast(options(page).first())).toBeGreaterThanOrEqual(3);
    await expect(place(page)).toBeFocused();

    await place(page).press("ArrowDown");
    await expect(options(page).nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options(page).first()).toHaveAttribute("aria-selected", "false");
  });

  test("AL1.3, AL1.6: three suggestions said; a tap puts its label in the field, closes the list, keeps the focus, and sends nothing", async ({ page }) => {
    const text = textOf("Salle");
    await answerFor(text, { features: [SALLE, ECOLE, MAIRIE].map(({ feature }) => feature) });
    const sent = creations(page);
    await openForm(page);
    await typeAndList(page, text, 3);
    await expect(status(page)).toHaveText("3 propositions");

    await options(page).nth(1).click();
    await expect(place(page)).toHaveValue(ECOLE.label);
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(place(page)).toBeFocused();
    await expect(positionLine(page)).toHaveText(`Position : ${ECOLE.label}`);
    expect(sent.length).toBe(0);
  });

  test("AL1.3, AL1.7, AL3.4: Arrow down then Enter chooses without sending; the position line describes the field, « Position ajoutée. »; the event shows the label, at the option's position", async ({
    page,
    db,
  }) => {
    const text = textOf("Salle des f");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature] });
    const sent = creations(page);
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 2);
    await place(page).press("ArrowDown");
    await place(page).press("Enter");

    await expect(place(page)).toHaveValue(SALLE.label);
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toBeFocused();
    await expect(place(page)).toHaveAccessibleDescription(`Position : ${SALLE.label}`);
    await expect(status(page)).toHaveText(FR.added);
    expect(sent.length).toBe(0);

    await createButton(page).click();
    const event = await created(page, db);
    expect(event).toEqual({ location: SALLE.label, location_lat: 45.73791, location_lng: 4.65616 });
    await expect(page.getByText(SALLE.label, { exact: true })).toBeVisible();
  });

  test("AL3.1: the text changed after a choice keeps the position line, and the event is created with that text and the choice's position", async ({ page, db }) => {
    const text = textOf("Mairie");
    await answerFor(text, { features: [MAIRIE.feature] });
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();

    const edited = "Devant la mairie de Vaugneray, côté parking";
    await place(page).fill(edited);
    await expect(positionLine(page)).toHaveText(`Position : ${MAIRIE.label}`);
    await expect(place(page)).toHaveAccessibleDescription(`Position : ${MAIRIE.label}`);

    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: edited, location_lat: 45.73701, location_lng: 4.65988 });
  });

  test("AL3.2, AL3.4: « Retirer » takes the line and the position, leaves the text, focuses the field, and says « Position retirée. »", async ({ page, db }) => {
    const text = textOf("École");
    await answerFor(text, { features: [ECOLE.feature] });
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();
    const said = await recordStatus(page);

    await removeButton(page).click();
    await expect(positionLine(page)).toHaveCount(0);
    await expect(removeButton(page)).toHaveCount(0);
    await expect(place(page)).toHaveValue(ECOLE.label);
    await expect(place(page)).toBeFocused();
    await expect(place(page)).toHaveAccessibleDescription("");
    await expect(status(page)).toHaveText(FR.removed);
    expect(await said()).toEqual([FR.removed]);

    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: ECOLE.label, location_lat: null, location_lng: null });
  });

  test("AL3.3, AL3.8: emptying the field takes its position and says « Position retirée. » once; emptying it without a position says nothing", async ({ page }) => {
    const text = textOf("Stade");
    await answerFor(text, { features: [SALLE.feature] });
    const nothing = textOf("Rien");
    await openForm(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();
    const said = await recordStatus(page);

    await place(page).fill("");
    await expect(positionLine(page)).toHaveCount(0);
    await expect(status(page)).toHaveText(FR.removed);

    await place(page).fill("St");
    await place(page).fill("");
    // Said after the field was emptied without a position: nothing in between.
    await place(page).fill(nothing);
    await expect(status(page)).toHaveText(FR.none);
    expect(await said()).toEqual([FR.removed, FR.none]);
  });

  test("AL2.1: « devant la salle des fêtes », sent without a choice, creates the event with that exact text and no position", async ({ page, db }) => {
    await openForm(page);
    await fillTheRest(page);
    await place(page).fill("devant la salle des fêtes");
    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: "devant la salle des fêtes", location_lat: null, location_lng: null });
  });

  test("AL2.3: an empty fake Photon gives « Aucune proposition… » under the field, said, and no list", async ({ page }) => {
    const text = textOf("Devant le portail vert");
    await openForm(page);
    await place(page).fill(text);
    await expect(page.locator("form p").filter({ hasText: FR.none })).toBeVisible();
    await expect(status(page)).toHaveText(FR.none);
    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  });

  test("AL1.8: a page in French asks Photon in French", async ({ page }) => {
    const text = textOf("Mairie");
    await openForm(page);
    await place(page).fill(text);
    await expect.poll(async () => (await requestsFor(text)).length).toBe(1);
    expect(new URLSearchParams((await requestsFor(text))[0].query).get("lang")).toBe("fr");
  });

  test("AL5.4: Enter sends the form while a pause is under way: it sends nothing, nor does a keystroke while sending, and « Retirer » does nothing", async ({
    page,
    db,
  }) => {
    const text = textOf("Salle");
    await answerFor(text, { features: [SALLE.feature] });
    const later = textOf("Devant la salle");
    await page.clock.install();
    const sent = searches(page);
    const creation = await holdCreation(page);
    await openForm(page);
    await fillTheRest(page);
    await typeAndList(page, text, 1);
    await options(page).first().click();
    const before = sent.length;

    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
    await place(page).fill(later);
    await place(page).press("Enter");
    await creation.sent;
    await page.clock.runFor(5_000);
    await place(page).pressSequentially(" bis");
    await page.clock.runFor(5_000);
    await expect(removeButton(page)).toHaveAttribute("aria-disabled", "true");
    // Tapped: a button `aria-disabled` takes the tap, which Playwright's click would wait out.
    await removeButton(page).dispatchEvent("click");
    await page.clock.resume();

    await creation.fail();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(FR.failed);
    // Anything sent while sending, or « Retirer » heard, came before the answer.
    expect(sent.length - before).toBe(0);
    await expect(positionLine(page)).toHaveText(`Position : ${SALLE.label}`);
    await expect(removeButton(page)).not.toHaveAttribute("aria-disabled");
    expect((await requestsFor(later)).length + (await requestsFor(`${later} bis`)).length).toBe(0);

    await creation.stop();
    await createButton(page).click();
    expect(await created(page, db)).toEqual({ location: `${later} bis`, location_lat: 45.73791, location_lng: 4.65616 });
  });

  test("AL5.4: an answer awaited when Enter sends the form opens no list, neither then nor once the sending failed", async ({ page }) => {
    const text = textOf("Gymnase Colette-Bes");
    await answerFor(text, { features: [SALLE.feature, ECOLE.feature], delayMs: 1_500 });
    const creation = await holdCreation(page);
    await openForm(page);
    await fillTheRest(page);
    const left = page.waitForRequest((request) => isSearch(request) && searchedText(request) === text);
    await place(page).fill(text);
    await left;

    // Abandoned when the form locks, or answered: either way, nothing more comes for it.
    const settled = Promise.race([
      page.waitForEvent("requestfailed", isSearch),
      page.waitForResponse((response) => isSearch(response.request())).then((response) => response.finished()),
    ]);
    await place(page).press("Enter");
    await creation.sent;
    await settled;
    await place(page).press("ArrowDown");
    await creation.fail();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(FR.failed);

    await expect(list(page)).toBeHidden();
    await expect(place(page)).toHaveAttribute("aria-expanded", "false");
    await expect(place(page)).toBeFocused();
  });

  test("AL6.2, AL6.3: while typing and choosing, every request of the page goes to our origin, and no URL carries the text typed, in any encoding", async ({
    page,
    baseURL,
  }) => {
    const text = `Lilas ${randomUUID()} l’été à Sainte-Foy-lès-Lyon`;
    await answerFor(text, { features: [SALLE.feature] });
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));
    const sent = searches(page);
    await openForm(page);
    await fillTheRest(page);

    await place(page).pressSequentially(text);
    await expect(options(page)).toHaveCount(1);
    await place(page).press("ArrowDown");
    await place(page).press("Enter");
    await place(page).pressSequentially(" côté parking");
    await expect(page.locator("form p").filter({ hasText: FR.none })).toBeVisible();
    await createButton(page).click();
    await expectUrl(page, ARRIVAL, "the organiser's link");

    // The text went, in the body of a POST to /api/lieux.
    expect(sent.filter((request) => request.method() === "POST" && searchedText(request) === text).length).toBe(1);
    const origin = new URL(baseURL!).origin;
    expect(urls.filter((url) => new URL(url).origin !== origin).length, "requests to another origin").toBe(0);
    const typed = new Set([...sent.map(searchedText), `${SALLE.label} côté parking`]);
    for (let n = 10; n <= text.length; n++) typed.add(text.slice(0, n));
    const carried = [...typed].filter((each) => urls.some((url) => carries(url, each)));
    expect(carried, "texts typed found in a URL").toEqual([]);
  });
});

test.describe("the place field in a browser set to English", () => {
  test.use({ locale: "en-GB" });

  test("AL1.8: a page in English asks Photon in English, and names its list Suggestions for Place", async ({ page }) => {
    const text = textOf("Town hall");
    await answerFor(text, { features: [MAIRIE.feature] });
    await openForm(page, "Create");
    await place(page, "Place").fill(text);
    await expect(list(page, "Suggestions for Place").getByRole("option")).toHaveCount(1);
    await expect(status(page)).toHaveText("1 suggestion");
    expect(new URLSearchParams((await requestsFor(text))[0].query).get("lang")).toBe("en");
  });
});

/**
 * Whether `url` carries `text`: as typed, composed or decomposed, percent-encoded (either case,
 * spaces as `%20` or `+`, once or more), or in base64 or base64url.
 */
function carries(url: string, text: string): boolean {
  const forms = new Set<string>();
  for (const each of [text, text.normalize("NFC"), text.normalize("NFD")]) {
    forms.add(each);
    forms.add(encodeURIComponent(each));
    forms.add(encodeURI(each));
    forms.add(new URLSearchParams({ q: each }).toString().slice(2));
    forms.add(Buffer.from(each).toString("base64").replace(/=+$/, ""));
    forms.add(Buffer.from(each).toString("base64url"));
  }
  const haystacks = [url];
  let decoded = url;
  for (let n = 0; n < 3; n++) {
    try {
      decoded = decodeURIComponent(decoded.replaceAll("+", " "));
    } catch {
      break;
    }
    haystacks.push(decoded);
  }
  return [...forms].some((form) => haystacks.some((haystack) => haystack.includes(form) || haystack.toLowerCase().includes(form.toLowerCase())));
}
