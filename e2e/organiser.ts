import type { BrowserContext, Page, Request, Response, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import { readEventRows } from "@/db/event-rows";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { adminTokenKey, creatorTest, expect } from "./fixtures";

/*
 * The organiser area in the browser (epic #154, #178): its path, its scene, and a record of
 * everything the browser sent and received, checked after each test for the admin token
 * (O6.1) and the browser's storage for the token and the event's numbers (O2.10).
 * No assertion, title or message here carries the token: a leak is named, never shown.
 * Each test's browser is the one that created its event (#597): it keeps the event's admin
 * token, as admin-token-store.ts does, from its first page on.
 */

export { expect };

/** The organiser area of an event, as a path: no organiser's link any more, nothing after it (OA1.6). */
export function organiserPath({ id }: Pick<SeededEvent, "id">): string {
  return `/e/${id}/admin`;
}

/**
 * The organiser area refused (#597, until each state has its own screen, #598): its title alone,
 * in the panel's place. Not the panel's own title, which is a button.
 */
export const areaRefused = (page: Page, name = "Espace organisateur") =>
  page.getByRole("main").getByRole("heading", { level: 2, name, exact: true }).filter({ hasNot: page.getByRole("button") });

export { adminTokenKey };

/**
 * From the next document of `page` on, its browser keeps `token` as the admin token of event
 * `id`, or none with `null`, instead of what it kept: a token one character off, for one.
 */
export async function keepAdminToken(page: Page, id: string, token: string | null): Promise<void> {
  await page.addInitScript(
    ({ key, token }) => {
      try {
        if (token === null) localStorage.removeItem(key);
        else localStorage.setItem(key, token);
      } catch {
        // A document without the app's storage (about:blank): nothing to keep there.
      }
    },
    { key: adminTokenKey(id), token },
  );
}

/**
 * The organiser area's « Modifier l’événement » (`name` in another language), not the one of a
 * leg's sentence, which an event without a position has too (#485, CA2.1).
 */
export const areaEditButton = (page: Page, name = "Modifier l’événement") =>
  page.getByRole("button", { name, exact: true }).and(page.locator(":not([data-map-hint])"));

/** The same, found by its words while a sheet makes the page `aria-hidden`. */
export const areaEditByText = (page: Page, text = "Modifier l’événement") => page.locator("button:not([data-map-hint])", { hasText: text });

/**
 * A token one character off: the same length and alphabet, its last character changed for
 * another a token of 16 bytes may end with, so that the browser still sends it (#597).
 */
export function oneCharOff(token: string): string {
  return `${token.slice(0, -1)}${token.at(-1) === "A" ? "Q" : "A"}`;
}

/** `text` with the admin token replaced: what a message may show of a path or a header. */
export function hideToken(text: string, token: string): string {
  return text.replaceAll(token, "[admin token]");
}

/** A number as typed, and its digits alone: a leak may drop the spaces or the « + ». Both are searched. */
export function digitsOf(phone: string): string[] {
  return [phone, phone.replace(/\D/g, "")];
}

/**
 * The page's HTML cut where the organiser area may show a number (#179, DO1): each leg's
 * section of the panel, by its leg, and the rest of the page without them. The whole HTML,
 * so that a number in a `hidden` element is found as well as a visible one. Throws on two
 * sections of the same leg: the second would replace the first, and go unchecked.
 */
export async function htmlByLegSection(page: Page): Promise<{ sections: Record<string, string>; rest: string }> {
  return page.evaluate(() => {
    const sections: Record<string, string> = {};
    let rest = document.documentElement.outerHTML;
    for (const section of document.querySelectorAll('section[aria-labelledby^="organiser-leg-"]')) {
      const leg = section.getAttribute("aria-labelledby")!.slice("organiser-leg-".length);
      if (leg in sections) throw new Error(`htmlByLegSection: two sections for the leg ${leg}`);
      sections[leg] = section.outerHTML;
      rest = rest.replace(section.outerHTML, "");
    }
    return { sections, rest };
  });
}

/** The numbers of the scene; D has none. */
export const SCENE_PHONES = {
  a: "06 31 52 74 96",
  b: "07 82 41 63 05",
  c: "+33 6 57 19 84 20",
  e: "06 08 95 37 61",
} as const;

export type ScenePhones = typeof SCENE_PHONES;

/**
 * The scene of O2.5, for event `eventId`. Aller: Anaïs (A) drives Bastien (B) and Élise (E);
 * Chloé (C) and Dylan (D, no number) are without a car. Retour: Bastien is without a car,
 * nobody else is concerned. Returns the numbers, by letter.
 */
export async function seedOrganiserScene(db: Kysely<Database>, eventId: string): Promise<ScenePhones> {
  const person = async (firstName: string, phone: string | null) =>
    (await seedPerson(db, eventId, { firstName, phone })).id;
  const a = await person("Anaïs", SCENE_PHONES.a);
  const b = await person("Bastien", SCENE_PHONES.b);
  const c = await person("Chloé", SCENE_PHONES.c);
  const d = await person("Dylan", null);
  const e = await person("Élise", SCENE_PHONES.e);
  const ride = await seedRide(db, eventId, a);
  for (const [personId, rideId] of [
    [b, ride],
    [e, ride],
    [c, null],
    [d, null],
  ] as const) {
    await seedPlacement(db, { personId, eventId, leg: "aller", rideId });
  }
  await seedPlacement(db, { personId: b, eventId, leg: "retour", rideId: null });
  return SCENE_PHONES;
}

/**
 * The crowd of O5.9, for event `eventId`: 15 cars and 60 persons. 8 cars at the aller, one
 * of them driven by a person with a number, and 7 at the retour, none: 7 cars without a
 * number on each leg. Of the 45 others, 13 ride at the aller and 14 are without a car there;
 * 15 ride at the retour and 20 are without a car there. The rest are not concerned. Every
 * list of the panel has more than 5 lines.
 */
export async function seedCrowd(db: Kysely<Database>, eventId: string): Promise<void> {
  const cars: Record<Leg, string[]> = { aller: [], retour: [] };
  for (let n = 0; n < 15; n++) {
    const leg = n < 8 ? "aller" : "retour";
    const phone = n === 0 ? "06 90 00 00 00" : null;
    const { id } = await seedPerson(db, eventId, { firstName: `Driver ${n + 1}`, phone });
    cars[leg].push(await seedRide(db, eventId, id, { leg }));
  }
  for (let n = 0; n < 45; n++) {
    const phone = n % 3 === 0 ? null : `07 ${10 + n} 20 30 40`;
    const personId = (await seedPerson(db, eventId, { firstName: `Guest ${n + 1}`, phone })).id;
    for (const [leg, riding, without] of [
      ["aller", 13, 27],
      ["retour", 15, 35],
    ] as const) {
      if (n >= without) continue;
      const rideId = n < riding ? cars[leg][n % cars[leg].length] : null;
      await seedPlacement(db, { personId, eventId, leg, rideId });
    }
  }
}

/** The button of a leg's title in the organiser's panel (O9.1), in any language. */
export const legButton = (page: Page, leg: Leg) => page.locator(`[id="organiser-leg-${leg}"] > button`);

/**
 * Unfolds the panel's sections of `legs`, both by default, once the panel shows (O9.4): every
 * section arrives folded (O9.2), and what its lists say is read unfolded. A leg the event does
 * not have is skipped; one already unfolded stays so. The page is then scrolled back where it
 * was: a click scrolls to its button, and a test that measures expects the page as it arrived.
 */
export async function unfoldLegs(page: Page, legs: Leg[] = ["aller", "retour"]): Promise<void> {
  await expect(legButton(page, "aller")).toBeVisible();
  const scrollY = await page.evaluate(() => window.scrollY);
  for (const leg of legs) {
    const button = legButton(page, leg);
    if ((await button.count()) === 0) continue;
    if ((await button.getAttribute("aria-expanded")) === "false") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
  }
  await page.evaluate((top) => window.scrollTo(0, top), scrollY);
}

/** A person of event `eventId`, without a car on each of `legs`. */
export async function seedWithoutCar(db: Kysely<Database>, eventId: string, firstName: string, legs: Leg[], phone: string | null = null) {
  const { id } = await seedPerson(db, eventId, { firstName, phone });
  for (const leg of legs) await seedPlacement(db, { personId: id, eventId, leg, rideId: null });
}

/** Léa's number, in the lists « Sans voiture » of `seedLegsExample`. */
export const LEGS_EXAMPLE_PHONE = "06 12 34 56 78";

/**
 * The example of organizer-view v3.5 (« Replier les legs »), for event `eventId`: at the aller,
 * 2 without a car (Léa with a number) and 3 free seats; at the retour, 4 and 2 seats missing.
 */
export async function seedLegsExample(db: Kysely<Database>, eventId: string): Promise<void> {
  const { id } = await seedPerson(db, eventId, { firstName: "Marc" });
  await seedRide(db, eventId, id, { seats: 3 });
  await seedRide(db, eventId, id, { leg: "retour", seats: 2, departureTime: "18:00:00" });
  await seedWithoutCar(db, eventId, "Léa", ["aller", "retour"], LEGS_EXAMPLE_PHONE);
  await seedWithoutCar(db, eventId, "Tom", ["aller", "retour"]);
  for (const name of ["Zoé", "Hugo"]) await seedWithoutCar(db, eventId, name, ["retour"]);
}

/** The key that keeps the organiser's card of event `id` folded on the device (#204, O8.5). */
export const foldKey = (id: string) => `fullcar:organiser-folded:${id}`;

/**
 * The widest summary line of O8.3, for event `eventId`: at the retour, 20 persons without a
 * car and one car of 8 seats, « Il manque 12 places ». Nobody at the aller.
 */
export async function seedWorstSummary(db: Kysely<Database>, eventId: string): Promise<void> {
  const { id } = await seedPerson(db, eventId, { firstName: "Marc" });
  await seedRide(db, eventId, id, { leg: "retour", seats: 8, departureTime: "18:00:00" });
  for (let n = 0; n < 20; n++) {
    const personId = (await seedPerson(db, eventId, { firstName: `Guest ${n + 1}` })).id;
    await seedPlacement(db, { personId, eventId, leg: "retour", rideId: null });
  }
}

/** How `localStorage` throws, for `breakStorage`: at the property itself, or at one of its methods. */
export type BrokenStorage = "property" | "getItem" | "setItem" | "removeItem";

/**
 * Makes `localStorage` throw, as a blocked storage does, on the documents of `/e/…` alone:
 * once the test is over, the fixture still reads the storage on `/icon.svg` (O2.10). A method
 * throws for every key but the admin token's, which the browser that created the event still
 * reads (#597); the property throwing, that browser reads no token either.
 */
export async function breakStorage(page: Page, how: BrokenStorage): Promise<void> {
  await page.addInitScript((how) => {
    if (!location.pathname.startsWith("/e/")) return;
    const refuse = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    if (how === "property") {
      Object.defineProperty(window, "localStorage", { configurable: true, get: refuse });
      return;
    }
    const original = Storage.prototype[how] as (this: Storage, ...args: string[]) => unknown;
    function refusing(this: Storage, ...args: string[]) {
      return String(args[0]).startsWith("fullcar:admin-token:") ? original.apply(this, args) : refuse();
    }
    Object.defineProperty(Storage.prototype, how, { configurable: true, value: refusing });
  }, how);
}

/**
 * Counts the `hashchange` events of each document of `page` (O6.3). The count reads 0 on a
 * document where nothing changed the fragment, and throws where the watch did not run.
 */
export async function watchHash(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const watched = window as unknown as { hashChanges: number };
    watched.hashChanges = 0;
    window.addEventListener("hashchange", () => (watched.hashChanges += 1));
  });
  return async () => {
    const count = await page.evaluate(() => (window as unknown as { hashChanges?: number }).hashChanges);
    if (count === undefined) throw new Error("watchHash: the watch did not run on this document");
    return count;
  };
}

/**
 * Holds, from now on, every action posted to an organiser's page whose body carries `text`,
 * until it fails (`fail`, a 500; `lose`, a cut connection) or goes through (`release`).
 */
export async function holdActionsWith(page: Page, text: string) {
  const held: Route[] = [];
  await page.route(
    (url) => url.pathname.endsWith("/admin"),
    (route) => (isAction(route.request()) && (route.request().postData() ?? "").includes(text) ? held.push(route) : route.fallback()),
  );
  return {
    held: () => held.length,
    fail: async () => {
      for (const route of held.splice(0)) await route.fulfill({ status: 500, contentType: "text/plain", body: "" });
    },
    lose: async () => {
      for (const route of held.splice(0)) await route.abort("internetdisconnected");
    },
    release: async () => {
      for (const route of held.splice(0)) await route.fallback();
    },
  };
}

/** A request the browser sent, and what it received. */
export interface Exchange {
  method: string;
  /** Its path and query string: what the server and its logs see. Never the fragment. */
  path: string;
  /** A server action: a POST with a `next-action` header. */
  action: boolean;
  html: boolean;
  requestBody: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  /** The body received; empty for a redirect. */
  answer: string;
}

export interface OrganiserTraffic {
  /**
   * Every request answered so far, with its answer. Rejects if a body could not be read:
   * a body that is not searched cannot pass for one without a leak.
   */
  exchanges(): Promise<Exchange[]>;
  /**
   * Takes the event's numbers now, for the storage check (O2.10), which also takes them once
   * the test is over: a test that deletes its event calls it before, or no number is checked.
   */
  keepNumbers(): Promise<void>;
}

/** Path and query string of a URL. */
function pathOf(url: string): string {
  const { pathname, search } = new URL(url);
  return `${pathname}${search}`;
}

/** Reads a body, or rejects naming its path, given with the token already hidden. */
async function bodyOf(text: Promise<string>, path: string): Promise<string> {
  try {
    return await text;
  } catch {
    throw new Error(`The body of ${path} could not be read`);
  }
}

/** A server action: a POST with a `next-action` header. */
export function isAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

/** A read of the App Router (a navigation, a refresh, a prefetch): `?_rsc=` in its URL. */
function isRouterRead(request: Request): boolean {
  return new URL(request.url()).searchParams.has("_rsc");
}

/** A request for suggestions of a place field (#432): `POST /api/lieux`. */
function isSearch(request: Request): boolean {
  return new URL(request.url()).pathname === "/api/lieux";
}

/** A tile of the map, from our route (#820): `GET /tuiles/{z}/{x}/{y}`. */
function isTile(request: Request): boolean {
  return new URL(request.url()).pathname.startsWith("/tuiles/");
}

/** The app's icons, as a page links them (`<link rel="icon">`) or a browser asks for them. */
const ICONS = new Set(["/icon.svg", "/favicon.ico"]);

/**
 * The favicon: the browser's own `GET` of one of the app's icons, `other` for Playwright, after
 * the page has loaded. Any other `other` request (a prefetch, a preflight, …) is not a file of the
 * app asked again: its body is the browser's (review of #450).
 */
function isFavicon(request: Request): boolean {
  return request.method() === "GET" && request.resourceType() === "other" && ICONS.has(new URL(request.url()).pathname);
}

/** A request as it left, answered or not. */
interface Sent {
  method: string;
  path: string;
  action: boolean;
  headers: Record<string, string>;
  body: string;
}

/**
 * Records every request of the context, and the answer to each that has one: a request the
 * browser gives up on (a favicon, a page left mid-load) only has its path and headers.
 * The answers React reads, a server action's and the router's (`?_rsc=`), are read as
 * Playwright fetches them (`route.fetch()`): React reads them through a stream reader, and
 * Chromium may then report the request aborted once the whole answer is in, and drop its body
 * before `response.text()` asks (#303, see `watchRequests` in `organiser-fold.spec.ts`). Such a
 * request, routed by the test itself ahead of this route, is read by `response.text()`, and
 * fails if it cannot be: a test that only lets it through uses `route.fallback()`. A redirect
 * is not followed here but given to the browser, which follows it through this route again: its
 * `Location` and the next request stay searched. A place field's search (`/api/lieux`) is read the
 * same way: the page aborts it once answered, at a keystroke or as its form sends, and Chromium
 * may then drop its body too (#432). A tile of the map (`/tuiles/…`) is read the same way: a
 * test ends once its last tile shows, and the page leaves at once (`leaveNoToken()`). Chromium
 * forgets the bodies of a page it leaves, and a tile's, asked of the browser while it left, was
 * no longer found (« No resource with given identifier found »): the check failed on a body the
 * page had shown (#820). Leaflet also abandons a tile it no longer shows, its answer given to a
 * page that no longer takes it.
 *
 * The favicon, which Chromium fetches once the page has loaded, is often still loading when the
 * test leaves the page (`leaveNoToken()`): its body, asked of the browser, was then refused, or
 * never came and held the teardown until the test's timeout (#436). It is a file of the app,
 * the same at every request: its body is read by asking the app for it again
 * (`context.request`), and the browser's own request is left as it is.
 *
 * A read the page leaves in flight, as a test ends on what its answer has already shown, gets no
 * `response`: its body is read all the same, by nobody. Read once the context closes, which first
 * disposes of every body fetched, it failed as « Response has been disposed », unhandled, and
 * failed the test (#764). What fixes it is the handler `read()` attaches to every body: a body
 * nobody reads is no longer left unhandled, whenever it fails. `stop()` waits for every body still
 * being read as well, so that none is still in flight when the context closes: a safeguard on top
 * of the handler, not what fixes #764. A body the page did receive and that cannot be read still
 * fails the check. That check reads every exchange once the test is over: one that fails before is
 * not left unhandled either, which made Playwright stop the worker mid-teardown, the next page
 * there aborted (« frame was detached », #820).
 */
async function record(context: BrowserContext, hide: (text: string) => string) {
  const state = { on: true };
  const fetched = new WeakMap<Request, Promise<string>>();
  const sent: Sent[] = [];
  const exchanges: Promise<Exchange>[] = [];
  const consoleLines: string[] = [];
  // Every body of this route not yet read or refused: `stop()` waits for them.
  const reading = new Set<Promise<void>>();
  const read = (body: Promise<string>) => {
    const done = body.then(
      () => {},
      () => {},
    );
    reading.add(done);
    void done.then(() => reading.delete(done));
    return body;
  };
  const askedAgain = (request: Request) => context.request.get(request.url()).then((again) => again.text());

  await context.route(
    () => state.on,
    async (route: Route) => {
      const request = route.request();
      if (isSearch(request) || isTile(request)) {
        // Abandoned by the page, answered or not (a keystroke, the form sending, a tile Leaflet
        // no longer shows, the page left), it is given to a page that may no longer take it; its
        // body, read here, is not marked unhandled meanwhile.
        const answer = route.fetch();
        fetched.set(request, read(answer.then((response) => response.text())));
        // Not fetched (the app's server down), it is abandoned here rather than left pending (#535).
        return answer.then(
          (response) => route.fulfill({ response }).catch(() => {}),
          () => route.abort().catch(() => {}),
        );
      }
      if (!isAction(request) && !isRouterRead(request)) return route.fallback();
      const answer = route.fetch({ maxRedirects: 0 });
      fetched.set(
        request,
        read(answer.then((response) => response.text())),
      );
      await route.fulfill({ response: await answer });
    },
  );

  async function exchange(response: Response): Promise<Exchange> {
    const request = response.request();
    const path = pathOf(request.url());
    const redirect = response.status() >= 300 && response.status() < 400;
    const answer = redirect
      ? ""
      : await bodyOf(fetched.get(request) ?? (isFavicon(request) ? askedAgain(request) : response.text()), hide(path));
    const responseHeaders = await response.allHeaders();
    return {
      method: request.method(),
      path,
      action: isAction(request),
      html: (responseHeaders["content-type"] ?? "").includes("text/html"),
      requestBody: request.postData() ?? "",
      requestHeaders: await request.allHeaders(),
      responseHeaders,
      answer,
    };
  }

  context.on("request", (request) => {
    if (!state.on) return;
    sent.push({
      method: request.method(),
      path: pathOf(request.url()),
      action: isAction(request),
      headers: request.headers(),
      body: request.postData() ?? "",
    });
  });
  context.on("response", (response) => {
    if (!state.on) return;
    const each = exchange(response);
    // Read by the check once the test is over: failed before, it is not left unhandled.
    void each.catch(() => {});
    exchanges.push(each);
  });
  context.on("console", (message) => {
    if (state.on) consoleLines.push(message.text());
  });
  context.on("weberror", (error) => {
    if (state.on) consoleLines.push(String(error.error()));
  });

  return {
    sent,
    /** Every response recorded so far: all of them once `stop()` has returned. */
    exchanges: () => Promise.all(exchanges),
    /** The same, each read or not: a body that could not be read does not hide the others. */
    settled: () => Promise.allSettled(exchanges),
    consoleLines,
    /** Ends the recording: no list above grows after it. */
    async stop() {
      state.on = false;
      // Not bounded by `route.fetch()`, which has no timeout here: no `actionTimeout` is set, and
      // the context's timeout is then 0. What bounds this wait is a timeout the size of the test's
      // (30 s), which Playwright grants afresh to afterEach hooks and fixture teardown. A search
      // (`/api/lieux`) is bounded by the app at about 3 s (`TIMEOUT_MS` in
      // `src/app/api/lieux/photon.ts`), and a tile (`/tuiles/…`) at 5 s (`TIMEOUT_MS` in
      // `src/app/tuiles/[z]/[x]/[y]/geoapify.ts`).
      await Promise.all(reading);
      await context.unrouteAll({ behavior: "ignoreErrors" });
    },
  };
}

/** Where each secret appears among `places`, by the secret's and the place's names: never the text itself. */
function findings(places: [string, string][], secrets: [string, string][]): string[] {
  const found = places.flatMap(([where, text]) =>
    secrets.filter(([, secret]) => text.includes(secret)).map(([what]) => `${what} in ${where}`),
  );
  return [...new Set(found)];
}

/**
 * The browser's storage for the app's origin, read from every page of the context. A page
 * is first taken to a document of the origin that holds no token, `/icon.svg`: its
 * `sessionStorage` is the tab's for the origin, whatever the page showed last, about:blank
 * included once `leaveNoToken()` (#160) has left it. Cookies and `localStorage` are the
 * context's: any page of the origin reads its `localStorage`, and with no page left, one is
 * opened for it here. Not by `storageState()`, which opens a hidden tab of its own for an
 * origin no page shows, and fails or waits when it cannot (#436). Exported for the test of that
 * page (`organiser-leaks.spec.ts`), the one case no other spec reaches. `kept`, an entry of
 * `localStorage` the app may keep, is left out of it, exactly that key with exactly that value:
 * the admin token under its event's key (O2.10 amended, #597).
 */
export async function storageOf(context: BrowserContext, origin: string, kept?: [string, string]): Promise<[string, string][]> {
  const places: [string, string][] = [];
  const pages = context.pages().length > 0 ? context.pages() : [await context.newPage()];
  for (const page of pages) {
    await page.goto(`${origin}/icon.svg`);
    const stored = await page.evaluate((kept) => ({
      local: JSON.stringify(Object.entries(localStorage).filter(([key, value]) => !kept || key !== kept[0] || value !== kept[1])),
      session: JSON.stringify(Object.entries(sessionStorage)),
    }), kept);
    places.push(["localStorage", stored.local], ["sessionStorage", stored.session]);
  }
  places.push(["the cookies", JSON.stringify(await context.cookies())]);
  return places;
}

/**
 * `creatorTest`, with `organiserTraffic`, automatic: once the test is over, the admin token of
 * `seededEvent` is in no path, query string, header, body received or console message, nor
 * in any request body but a server action's posted to `/e/{id}/admin` (O6.1); no number of
 * the event is in the origin's `localStorage`, `sessionStorage` or cookies, nor the token,
 * but in `localStorage` under its event's key (O2.10 amended, #597). It runs after the test's
 * `afterEach` hooks, `leaveNoToken()` (#160) included, and takes the pages to `/icon.svg`
 * before it checks anything. Both checks report, whichever fails. `keepAdminToken` changes
 * the token the browser keeps, for a page.
 */
export const test = creatorTest.extend<{ organiserTraffic: OrganiserTraffic }>({
  organiserTraffic: [
    async ({ context, db, seededEvent, baseURL }, provide) => {
      const { token, id } = seededEvent;
      const hide = (text: string) => hideToken(text, token);
      const recorded = await record(context, hide);
      // Every number of the event, by the only query that reads them, named by its person's
      // rank in the event, as the scene names them by letter: never shown.
      const numbersNow = async () => {
        const { persons, phonesById } = await readEventRows(db, id);
        return persons.flatMap(({ id: personId }, n): [string, string][] => {
          const phone = phonesById.get(personId);
          return phone ? digitsOf(phone).map((form) => [`the number of person ${n + 1}`, form]) : [];
        });
      };
      const kept: [string, string][] = [];
      await provide({
        exchanges: recorded.exchanges,
        keepNumbers: async () => {
          kept.push(...(await numbersNow()));
        },
      });

      await recorded.stop();
      const settled = await recorded.settled();
      const exchanges = settled.flatMap((each) => (each.status === "fulfilled" ? [each.value] : []));
      const unread = settled.flatMap((each) => (each.status === "rejected" ? [hide(String(each.reason))] : []));
      const named = (what: string, { method, path }: Pick<Sent, "method" | "path">) =>
        `${what} (${method} ${hide(path)})`;
      // The only body the token may be in: a server action posted to the organiser's page.
      const pageAction = ({ action, path }: Sent) => action && path === `/e/${id}/admin`;
      const places: [string, string][] = [
        ...recorded.sent.flatMap((each): [string, string][] => [
          [named("the path or query of a request", each), each.path],
          [named("the headers of a request", each), JSON.stringify(each.headers)],
          [named("the body of a request", each), pageAction(each) ? "" : each.body],
        ]),
        ...exchanges.flatMap((each): [string, string][] => [
          [named("the headers of a request", each), JSON.stringify(each.requestHeaders)],
          [named("the headers of the answer to a request", each), JSON.stringify(each.responseHeaders)],
          [named("the answer to a request", each), each.answer],
        ]),
        ...recorded.consoleLines.map((line, n): [string, string] => [`console message ${n}`, line]),
      ];
      const leaks = findings(places, [["the admin token", token]]);

      const stored = findings(await storageOf(context, new URL(baseURL!).origin, [adminTokenKey(id), token]), [
        ["the admin token", token],
        ...kept,
        ...(await numbersNow()),
      ]);

      // Only now, the pages on /icon.svg: the snapshot of a failure holds no admin link.
      expect.soft(unread, "answers that could not be read").toEqual([]);
      expect.soft(exchanges.length, "requests recorded").toBeGreaterThan(0);
      expect.soft(leaks, "O6.1").toEqual([]);
      expect(stored, "O2.10").toEqual([]);
    },
    { auto: true },
  ],
});
