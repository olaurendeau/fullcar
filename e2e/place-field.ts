import { randomUUID } from "node:crypto";
import type { Locator, Page, Request, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { expect, expectUrl } from "./fixtures";
import { fillAddress } from "./mailbox";
import { photonFeature, type PhotonFeature } from "./photon";

/*
 * The place field of « Créer un événement » (#428, place-autocomplete), for the tests that
 * drive it against the slot's fake Photon: its words, its parts, and what the page sends.
 * `textOf`, `namedPlace`, `isSearch`, `searches` and `recordStatus` serve the cars' place
 * fields too (#430, #431).
 */

export const FR = {
  place: "Lieu",
  list: "Propositions pour Lieu",
  remove: "Retirer la position (Lieu)",
  added: "Position ajoutée.",
  removed: "Position retirée.",
  none: "Aucune proposition. Votre texte sera gardé tel quel.",
  searching: "Recherche de propositions…",
  unavailable: "Propositions indisponibles. Votre texte sera gardé tel quel.",
  keepText: "Ou gardez votre texte tel quel.",
  source: "Propositions : © les contributeurs d’OpenStreetMap",
  create: "Créer",
  failed: "Impossible de créer l’événement. Vérifiez la connexion, puis réessayez.",
};

export const NEW_EVENT = "/nouveau";
/** Where a new event lands: its organiser area, by its id, without a fragment (OA1.6). */
export const ARRIVAL = /\/e\/([2-9A-HJ-NP-Za-km-z]{8})\/admin$/;

/** A text of this test's own: the fake keeps its answers an hour, and the app its cache. */
export function textOf(label: string) {
  return `${label} ${randomUUID()}`;
}

/** A named place in France, which the page writes « {name}, {postcode} {city} ». */
export function namedPlace(name: string, lat: number, lon: number, postcode = "69670", city = "Vaugneray"): { feature: PhotonFeature; label: string } {
  return {
    feature: photonFeature({ lat, lon, name, postcode, city, countrycode: "FR", country: "France" }),
    label: `${name}, ${postcode} ${city}`,
  };
}

export const SALLE = namedPlace("Salle des fêtes", 45.737912, 4.656163);
export const ECOLE = namedPlace("École primaire", 45.738456, 4.654321);
export const MAIRIE = namedPlace("Mairie", 45.737011, 4.659876);
export const PLACES = [SALLE, ECOLE, MAIRIE, namedPlace("Gymnase", 45.7391, 4.6512), namedPlace("Stade", 45.7402, 4.6623), namedPlace("Église", 45.7375, 4.6571)];

export const place = (page: Page, name = FR.place) => page.getByRole("combobox", { name, exact: true });
export const list = (page: Page, name = FR.list) => page.getByRole("listbox", { name, exact: true });
export const options = (page: Page) => list(page).getByRole("option");
export const status = (page: Page) => page.locator("form").getByRole("status");
export const positionLine = (page: Page) => page.locator("form").getByText(/^Position : /);
export const removeButton = (page: Page) => page.getByRole("button", { name: FR.remove, exact: true });
export const createButton = (page: Page, name = FR.create) => page.getByRole("button", { name, exact: true });
/** The discreet line under the field that says `words`. */
export const line = (page: Page, words: string) => page.locator("form p").filter({ hasText: words });

/** The form, once hydrated: « Créer » stays inactive until then. */
export async function openForm(page: Page, create = FR.create) {
  await page.goto(NEW_EVENT);
  await expect(createButton(page, create)).toBeEnabled({ timeout: 15_000 });
}

/** Every field but the place: a title, a start a week from the device's today, an end the same day, and the address a creation requires (OA1.1). */
export async function fillTheRest(page: Page, labels = { title: "Titre", date: "Date de début", time: "Heure de début", end: "Heure de fin" }) {
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
  await fillAddress(page);
}

export const isSearch = (request: Request) => new URL(request.url()).pathname === "/api/lieux";
export const searchedText = (request: Request) => (request.postDataJSON() as { text: string }).text;

/** The page's requests to `/api/lieux`, from now on. */
export function searches(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => isSearch(request) && sent.push(request));
  return sent;
}

/** The creation requests, a server action posted to the form's page, from now on. */
export function creations(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === NEW_EVENT && request.headers()["next-action"]) sent.push(request);
  });
  return sent;
}

/** Holds the creations until `fail` answers them 500; `stop` holds no more. */
export async function holdCreation(page: Page) {
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

/**
 * Each text the `status` region `region` is given, from now on, in order: kept in the page
 * under a name of its own, so two regions of one form are recorded apart.
 */
export async function recordStatus(region: Locator) {
  const key = `said-${randomUUID()}`;
  await region.evaluate((element, name) => {
    const said: string[] = [];
    (window as unknown as Record<string, string[]>)[name] = said;
    new MutationObserver(() => element.textContent && said.push(element.textContent)).observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, key);
  return () => region.page().evaluate((name) => (window as unknown as Record<string, string[]>)[name], key);
}

/** The event just created, as stored: its place's text and position. */
export async function created(page: Page, db: Kysely<Database>) {
  await expectUrl(page, ARRIVAL, "the organiser's link");
  const id = ARRIVAL.exec(page.url())![1];
  return db.selectFrom("event").select(["location", "location_lat", "location_lng"]).where("id", "=", id).executeTakeFirstOrThrow();
}

/** `text` typed, its suggestions shown: `count` of them. */
export async function typeAndList(page: Page, text: string, count: number) {
  await place(page).fill(text);
  await expect(options(page)).toHaveCount(count);
}

/**
 * The contrast, as WCAG measures it, of the 3 px bar (`box-shadow`) of `option` with its
 * background, both drawn by the page on white to read their sRGB values.
 */
export function barContrast(option: Locator): Promise<number> {
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

/**
 * Whether `url` carries `text`: as typed, composed or decomposed, percent-encoded (either case,
 * spaces as `%20` or `+`, once or more), or in base64 or base64url.
 */
export function carries(url: string, text: string): boolean {
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
