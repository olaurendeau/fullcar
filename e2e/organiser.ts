import type { BrowserContext, Page, Request, Response, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import { readEventRows } from "@/db/event-rows";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import { expect, test as base } from "./fixtures";

/*
 * The organiser area in the browser (epic #154, #178): its link, its scene, and a record of
 * everything the browser sent and received, checked after each test for the admin token
 * (O6.1) and the browser's storage for the token and the event's numbers (O2.10).
 * No assertion, title or message here carries the token: a leak is named, never shown.
 */

export { expect };

/** The organiser's link of an event, as a path: the token in the fragment, which no request carries. */
export function organiserPath({ id, token }: SeededEvent): string {
  return `/e/${id}/admin#${token}`;
}

/** A token one character off: the same length and alphabet, its last character changed. */
export function oneCharOff(token: string): string {
  return `${token.slice(0, -1)}${token.at(-1) === "A" ? "B" : "A"}`;
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
function isAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
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
 * A server action's answer is read as Playwright fetches it (`route.fetch()`): Chromium may
 * drop it before `response.text()` asks. An action routed by the test itself, ahead of this
 * route, is read by `response.text()`, and fails if it cannot be.
 */
async function record(context: BrowserContext, hide: (text: string) => string) {
  const state = { on: true };
  const fetched = new WeakMap<Request, Promise<string>>();
  const sent: Sent[] = [];
  const exchanges: Promise<Exchange>[] = [];
  const consoleLines: string[] = [];

  await context.route(
    () => state.on,
    async (route: Route) => {
      const request = route.request();
      if (!isAction(request)) return route.fallback();
      const answer = route.fetch();
      fetched.set(
        request,
        answer.then((response) => response.text()),
      );
      await route.fulfill({ response: await answer });
    },
  );

  async function exchange(response: Response): Promise<Exchange> {
    const request = response.request();
    const path = pathOf(request.url());
    const redirect = response.status() >= 300 && response.status() < 400;
    const answer = redirect ? "" : await bodyOf(fetched.get(request) ?? response.text(), hide(path));
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
    if (state.on) exchanges.push(exchange(response));
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
 * context's.
 */
async function storageOf(context: BrowserContext, origin: string): Promise<[string, string][]> {
  const places: [string, string][] = [];
  for (const page of context.pages()) {
    await page.goto(`${origin}/icon.svg`);
    const stored = await page.evaluate(() => ({
      local: JSON.stringify(Object.entries(localStorage)),
      session: JSON.stringify(Object.entries(sessionStorage)),
    }));
    places.push(["localStorage", stored.local], ["sessionStorage", stored.session]);
  }
  const { cookies, origins } = await context.storageState();
  places.push(["the cookies", JSON.stringify(cookies)]);
  for (const each of origins) places.push(["localStorage", JSON.stringify(each.localStorage)]);
  return places;
}

/**
 * `test`, with `organiserTraffic`, automatic: once the test is over, the admin token of
 * `seededEvent` is in no path, query string, header, body received or console message, nor
 * in any request body but a server action's posted to `/e/{id}/admin` (O6.1); neither the
 * token nor any number of the event is in the origin's `localStorage`, `sessionStorage` or
 * cookies (O2.10). It runs after the test's `afterEach` hooks, `leaveNoToken()` (#160)
 * included, and takes the pages to `/icon.svg` before it checks anything: the snapshot of a
 * failure never holds the admin link. Both checks report, whichever fails.
 */
export const test = base.extend<{ organiserTraffic: OrganiserTraffic }>({
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

      const stored = findings(await storageOf(context, new URL(baseURL!).origin), [
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
