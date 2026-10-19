import type { BrowserContext, Page, Request, Response, Route } from "@playwright/test";
import type { Kysely } from "kysely";
import { readEventRows } from "@/db/event-rows";
import type { Database } from "@/db/schema";
import type { SeededEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
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
  headers: Record<string, string>;
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
    if (state.on) sent.push({ method: request.method(), path: pathOf(request.url()), headers: request.headers() });
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
    exchanges: () => Promise.all(exchanges),
    consoleLines,
    async stop() {
      state.on = false;
      await context.unrouteAll({ behavior: "ignoreErrors" });
    },
  };
}

/** Where each secret appears among `places`, by the place's name: never the text itself. */
function findings(places: [string, string][], secrets: [string, string][]): string[] {
  return places.flatMap(([where, text]) =>
    secrets.filter(([, secret]) => text.includes(secret)).map(([what]) => `${what} in ${where}`),
  );
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
 * `seededEvent` is in no path, query string, header, body received or console message
 * (O6.1), and neither the token nor any number of the event is in the origin's
 * `localStorage`, `sessionStorage` or cookies (O2.10). It runs after the test's `afterEach`
 * hooks, `leaveNoToken()` (#160) included, and leaves the pages on `/icon.svg`.
 */
export const test = base.extend<{ organiserTraffic: OrganiserTraffic }>({
  organiserTraffic: [
    async ({ context, db, seededEvent, baseURL }, provide) => {
      const { token, id } = seededEvent;
      const hide = (text: string) => hideToken(text, token);
      const recorded = await record(context, hide);
      await provide({ exchanges: recorded.exchanges });

      const exchanges = await recorded.exchanges();
      await recorded.stop();
      const named = (what: string, { method, path }: Pick<Sent, "method" | "path">) =>
        `${what} (${method} ${hide(path)})`;
      const places: [string, string][] = [
        ...recorded.sent.flatMap((each): [string, string][] => [
          [named("the path or query of a request", each), each.path],
          [named("the headers of a request", each), JSON.stringify(each.headers)],
        ]),
        ...exchanges.flatMap((each): [string, string][] => [
          [named("the headers of a request", each), JSON.stringify(each.requestHeaders)],
          [named("the headers of the answer to a request", each), JSON.stringify(each.responseHeaders)],
          [named("the answer to a request", each), each.answer],
        ]),
        ...recorded.consoleLines.map((line, n): [string, string] => [`console message ${n}`, line]),
      ];
      expect(exchanges.length, "requests recorded").toBeGreaterThan(0);
      expect(findings(places, [["the admin token", token]]), "O6.1").toEqual([]);

      // Every number of the event, by the only query that reads them.
      const { phonesById } = await readEventRows(db, id);
      const numbers = [...phonesById.values()].flatMap((phone) => (phone ? digitsOf(phone) : []));
      const secrets: [string, string][] = [
        ["the admin token", token],
        ...numbers.map((number): [string, string] => [`the number ${number}`, number]),
      ];
      const stored = await storageOf(context, new URL(baseURL!).origin);
      expect(findings(stored, secrets), "O2.10").toEqual([]);
    },
    { auto: true },
  ],
});
