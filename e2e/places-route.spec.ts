import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { holdToken, messages, newToken } from "./device";
import { expect, leaveNoToken, test } from "./fixtures";
import { answerFor, photonFeature, requestsFor } from "./photon";

// The page holds a personal token (AL6.1, AL2.6): nothing Playwright writes may carry it.
leaveNoToken();

// #426: `POST /api/lieux` (place-autocomplete, « La route et Photon ») against the slot's fake
// Photon, from end to end: what Photon receives (AL6.1), what the route refuses (AL6.4), a slow
// Photon that holds nothing else of the page (AL2.6), a text in the URL not read (AL6.3), and the
// `Origin` a page of ours really sends.

/** The version deployed, which fullcar's User-Agent names. */
const VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

/** A text of this test's own: the fake keeps its answers and its requests, and the app its cache, an hour. */
function textOf(label: string) {
  return `${label} ${randomUUID()}`;
}

/** Two characters of no other test, of any run: the fake keeps every request while it runs. */
function twoCharacters() {
  return String.fromCodePoint(0x4e00 + randomInt(20_000), 0x4e00 + randomInt(20_000));
}

/** A feature as the real Photon sends it, every key included: none needs a cast. */
const LILAS = photonFeature({
  lat: 48.876543,
  lon: 2.393211,
  osm_type: "W",
  osm_id: 123456789,
  osm_key: "leisure",
  osm_value: "sports_centre",
  extent: [2.39301, 48.87671, 2.39342, 48.87637],
  name: "Gymnase des Lilas",
  housenumber: "12",
  street: "Rue des Lilas",
  postcode: "75019",
  locality: "Belleville",
  district: "Paris 19e Arrondissement",
  city: "Paris",
  county: "Paris",
  state: "Île-de-France",
  country: "France",
  countrycode: "FR",
  type: "house",
});
const LILAS_SUGGESTION = { label: "Gymnase des Lilas, 75019 Paris", lat: 48.87654, lng: 2.39321 };

type Answer = { status: number; body: unknown };
/** The page's window, where AL2.6 keeps the search's answer once it comes. */
type Searched = Window & { searched?: unknown };

/**
 * `POST /api/lieux` from the page, as the place field (#428) will send it: a `fetch` of the page's
 * own scripts, in its default `cors` mode and the page's referrer policy, unless `init` says otherwise.
 */
function searchFromPage(page: Page, body: unknown, init: Pick<RequestInit, "referrer" | "referrerPolicy"> = {}): Promise<Answer> {
  return page.evaluate(
    async ([body, init]) => {
      const response = await fetch("/api/lieux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...init,
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    [body, init] as const,
  );
}

/** The next request of the page to `/api/lieux`. */
const nextSearch = (page: Page) => page.waitForRequest((request) => new URL(request.url()).pathname === "/api/lieux");

test.describe("POST /api/lieux against the fake Photon", () => {
  test.use({ locale: "fr-FR" });

  // Why this test: the route answers 403 to a request whose `Origin` is not ours, and a browser may
  // send `Origin: null` for a POST under `Referrer-Policy: no-referrer`, which every page of ours
  // has. Were it so, every search of the place field would be refused, and the field would say
  // « indisponibles » to everyone. A call from Playwright's request context sends the `Origin` it
  // is told: only a `fetch` from a page the app serves shows what a browser sends.
  test("a fetch from one of our pages sends our own Origin, not null, and the route accepts it", async ({ page, baseURL }) => {
    const text = textOf("Gymnase des Lilas");
    await answerFor(text, { features: [LILAS] });
    const served = await page.goto("/nouveau");
    expect(served?.headers()["referrer-policy"]).toBe("no-referrer");

    const sent = nextSearch(page);
    const answer = await searchFromPage(page, { text, locale: "fr" });
    const request = await sent;

    expect(await request.headerValue("origin")).toBe(new URL(baseURL!).origin);
    expect(await request.headerValue("referer")).toBeNull();
    expect(answer).toEqual({ status: 200, body: { state: "ok", suggestions: [LILAS_SUGGESTION] } });
    expect(await requestsFor(text)).toHaveLength(1);
  });

  test("AL6.1: Photon receives neither the visitor's address, cookie, Referer, event id nor token, and fullcar's User-Agent", async ({ context, db, page, seededEvent }) => {
    const token = newToken();
    const tom = await seedPerson(db, seededEvent.id, { firstName: "Tom" }, token);
    await holdToken(page, seededEvent.id, token);
    await page.goto(`/e/${seededEvent.id}`);
    await context.addCookies([{ name: "fullcar-test", value: `${seededEvent.id}.${token}`, url: new URL("/", page.url()).href }]);
    // What a proxy adds, and a visitor may forge: the route must pass none of it on.
    await page.setExtraHTTPHeaders({
      "X-Forwarded-For": "203.0.113.7",
      "X-Real-IP": "203.0.113.7",
      Forwarded: "for=203.0.113.7;proto=https",
    });

    const text = textOf("12 rue des Lilas");
    await answerFor(text, { features: [LILAS] });
    const sent = nextSearch(page);
    // The worst a page could send: a Referer naming the event, and the event and the token in the body.
    const answer = await searchFromPage(
      page,
      { text, locale: "fr", eventId: seededEvent.id, personId: tom.id, token },
      { referrer: page.url(), referrerPolicy: "unsafe-url" },
    );
    const visitor = await (await sent).allHeaders();
    expect(answer.status).toBe(200);
    // The route was sent all of it: else, its absence at Photon's would prove nothing.
    expect(visitor["x-forwarded-for"]).toBe("203.0.113.7");
    expect(visitor["x-real-ip"]).toBe("203.0.113.7");
    expect(visitor.forwarded).toBe("for=203.0.113.7;proto=https");
    // Booleans only, here and below: a failure must not print the token (#365).
    expect(visitor.cookie?.includes(token), "the route was sent the cookie holding the token").toBe(true);
    expect(visitor.referer).toContain(seededEvent.id);

    const received = await requestsFor(text);
    expect(received.length).toBe(1);
    const [{ headers }] = received;
    for (const name of ["x-forwarded-for", "x-real-ip", "forwarded", "cookie", "referer", "origin"]) {
      expect(name in headers, `${name} reached Photon`).toBe(false);
    }
    const everything = JSON.stringify(received);
    for (const [what, value] of [
      ["the visitor's address", "203.0.113.7"],
      ["the event's id", seededEvent.id],
      ["the person's id", tom.id],
      ["the token", token],
    ]) {
      expect(everything.includes(value), `${what} reached Photon`).toBe(false);
    }
    expect(headers["user-agent"]).toBe(`fullcar/${VERSION} (+https://github.com/olaurendeau/fullcar)`);
  });

  test.describe("AL6.4, by HTTP: refused without asking Photon", () => {
    test("405 to a GET", async ({ request }) => {
      const text = textOf("Par GET");
      const response = await request.get(`/api/lieux?${new URLSearchParams({ text, q: text, locale: "fr" })}`);
      expect(response.status()).toBe(405);
      expect(await requestsFor(text)).toEqual([]);
    });

    test("403 to another Origin, or none, and 200 to ours", async ({ request, baseURL }) => {
      const ours = new URL(baseURL!).origin;
      for (const origin of ["http://ailleurs.example", "null", undefined]) {
        const text = textOf("Ailleurs");
        const response = await request.post("/api/lieux", { data: { text, locale: "fr" }, headers: origin ? { Origin: origin } : {} });
        expect(response.status(), String(origin)).toBe(403);
        expect(await requestsFor(text), String(origin)).toEqual([]);
      }
      // The same request from our Origin: the 403s above are for the Origin alone.
      const text = textOf("Chez nous");
      const response = await request.post("/api/lieux", { data: { text, locale: "fr" }, headers: { Origin: ours } });
      expect(response.status()).toBe(200);
      expect(await requestsFor(text)).toHaveLength(1);
    });

    test("400 invalid to a text of 2 characters, and 200 to one of 3", async ({ request, baseURL }) => {
      const headers = { Origin: new URL(baseURL!).origin };
      const short = twoCharacters();
      const response = await request.post("/api/lieux", { data: { text: ` ${short} `, locale: "fr" }, headers });
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ state: "invalid" });
      expect(await requestsFor(short)).toEqual([]);
      expect(await requestsFor(` ${short} `)).toEqual([]);

      const three = `${short}${twoCharacters().slice(0, 1)}`;
      expect((await request.post("/api/lieux", { data: { text: three, locale: "fr" }, headers })).status()).toBe(200);
      expect(await requestsFor(three)).toHaveLength(1);
    });
  });

  test("AL2.6: a search Photon holds 2 s does not hold a seat taken meanwhile, whose answer comes first", async ({ db, page, seededEvent }) => {
    const token = newToken();
    const tom = await seedPerson(db, seededEvent.id, { firstName: "Tom" }, token);
    await seedPlacement(db, { personId: tom.id, eventId: seededEvent.id, leg: "aller", rideId: null });
    const sophie = await seedPerson(db, seededEvent.id, { firstName: "Sophie" });
    await seedRide(db, seededEvent.id, sophie.id, { departureTime: "07:00:00" });
    await holdToken(page, seededEvent.id, token);
    const text = textOf("Lent");
    // Under the route's own 3 s timeout: the late answer is Photon's, not `unavailable`.
    await answerFor(text, { delayMs: 2000, features: [LILAS] });

    await page.goto(`/e/${seededEvent.id}`);
    const seat = page
      .getByRole("article", { name: "Voiture de Sophie" })
      .getByRole("button", { name: "Place libre : prendre une place dans la voiture de Sophie" })
      .first();
    await expect(seat).toBeEnabled();
    // Sent and not awaited: `searched` is set to its answer when it comes.
    await page.evaluate((text) => {
      void fetch("/api/lieux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, locale: "fr" }),
      })
        .then((response) => response.json())
        .then((answer) => ((window as Searched).searched = answer));
    }, text);
    // Photon holds it now: the seat is taken while the search waits. Every 50 ms, not the default
    // 100, 250, 500 and 1000 ms: seen 850 ms late, the hold would leave little time for the seat.
    await expect.poll(async () => (await requestsFor(text)).length, { intervals: [50] }).toBe(1);

    await seat.click();
    await expect(messages(page)).toHaveText(["Tom est dans la voiture de Sophie"]);
    expect(await page.evaluate(() => (window as Searched).searched), "the search answered before the seat").toBeUndefined();
    // The search was held, not lost: Photon's answer comes after all.
    await expect
      .poll(() => page.evaluate(() => (window as Searched).searched), { timeout: 10_000 })
      .toEqual({ state: "ok", suggestions: [LILAS_SUGGESTION] });
  });

  // AL6.3, the route's part only: the place field (#428) sends the requests whose URLs AL6.3 is about.
  test("AL6.3, the route: a text in the URL and not in the body is not read, 400, and Photon is not asked", async ({ page }) => {
    await page.goto("/nouveau");
    const elsewhere = textOf("Dans l'URL");
    const query = new URLSearchParams({ text: elsewhere, q: elsewhere, locale: "fr" });
    const refused = await page.evaluate(async (path) => {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: "fr" }) });
      return { status: response.status, body: await response.json() };
    }, `/api/lieux?${query}`);
    expect(refused).toEqual({ status: 400, body: { state: "invalid" } });
    expect(await requestsFor(elsewhere)).toEqual([]);
  });
});
