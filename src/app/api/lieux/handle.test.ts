import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceQuery } from "@/domain/suggestion";
import { handlePlaces } from "./handle";
import type { Photon, PhotonAnswer } from "./photon";

const HOST = "fullcar.example";
const ORIGIN = `https://${HOST}`;
const LILAS = { text: "12 rue des Lilas", locale: "fr" };
const SUGGESTIONS = [{ label: "12 Rue des Lilas, 69126 Brindas", lat: 45.7581, lng: 4.6894 }];
const OK: PhotonAnswer = { state: "ok", suggestions: SUGGESTIONS };

/** A Photon that answers `answer`, and records what it was asked. */
function photonAnswering(answer: PhotonAnswer = OK) {
  const search = vi.fn(async (query: PlaceQuery) => (void query, answer));
  return { photon: { search } satisfies Photon, search };
}

/** `POST /api/lieux` from our own page, as Vercel forwards it, unless `headers` says otherwise. */
function post(body: BodyInit | null, headers: Record<string, string | undefined> = {}) {
  const all: Record<string, string | undefined> = { origin: ORIGIN, host: "localhost:3000", "x-forwarded-host": HOST, ...headers };
  const defined = Object.entries(all).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return new Request("http://localhost:3000/api/lieux", { method: "POST", headers: defined, body, duplex: "half" } as RequestInit);
}

const json = (value: unknown) => JSON.stringify(value);
/** The text in Latin-1, one byte per character: « é » is 0xE9, which UTF-8 cannot read alone. */
const latin1 = (text: string) => Uint8Array.from(text, (character) => character.charCodeAt(0));

/** Every line written to the console, by any of its methods. */
let logs: unknown[][];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("a query from our own page", () => {
  it("answers 200, not stored, with Photon's suggestions", async () => {
    const { photon, search } = photonAnswering();
    const response = await handlePlaces(post(json(LILAS)), photon);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual(OK);
    expect(search.mock.calls).toEqual([[{ text: "12 rue des Lilas", locale: "fr", near: null }]]);
  });

  it("answers 200 unavailable when Photon is, and nothing more", async () => {
    const response = await handlePlaces(post(json(LILAS)), photonAnswering({ state: "unavailable" }).photon);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe(json({ state: "unavailable" }));
  });

  it("asks Photon near the event rounded to 1 decimal, never its exact position", async () => {
    const { photon, search } = photonAnswering();
    await handlePlaces(post(json({ ...LILAS, near: { lat: 45.7581, lng: 4.6894 } })), photon);
    expect(search.mock.calls[0][0].near).toEqual({ lat: 45.8, lng: 4.7 });
  });

  it("compares the Origin with Host when no proxy says otherwise", async () => {
    const { photon, search } = photonAnswering();
    const direct = post(json(LILAS), { origin: "http://localhost:3010", host: "localhost:3010", "x-forwarded-host": undefined });
    expect((await handlePlaces(direct, photon)).status).toBe(200);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("compares the Origin with the first host the proxies forward, in any case", async () => {
    const { photon, search } = photonAnswering();
    for (const forwarded of ["FULLCAR.example, interne.proxy", "FULLCAR.example , interne.proxy"]) {
      expect((await handlePlaces(post(json(LILAS), { "x-forwarded-host": forwarded }), photon)).status).toBe(200);
    }
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("reads a body of 1 024 bytes, said by Content-Length or not", async () => {
    const body = json(LILAS);
    const padded = body + " ".repeat(1024 - body.length);
    expect((await handlePlaces(post(padded), photonAnswering().photon)).status).toBe(200);
    expect((await handlePlaces(post(padded, { "content-length": "1024" }), photonAnswering().photon)).status).toBe(200);
  });
});

describe("a query from elsewhere (AL6.4)", () => {
  it.each([
    ["without Origin", { origin: undefined }],
    ["from another site", { origin: "https://elsewhere.example" }],
    ["from our host on another port", { origin: `https://${HOST}:8443` }],
    ["from an opaque origin", { origin: "null" }],
    ["from Host when the proxy names another", { origin: "http://localhost:3000" }],
    ["from a host a proxy forwards after the first", { origin: "https://interne.proxy", "x-forwarded-host": `${HOST}, interne.proxy` }],
    ["without a host to compare with", { "x-forwarded-host": undefined, host: undefined }],
  ])("answers 403 %s, without asking Photon", async (_, headers) => {
    const { photon, search } = photonAnswering();
    const response = await handlePlaces(post(json(LILAS), headers), photon);
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(search).not.toHaveBeenCalled();
  });
});

describe("a query the route cannot read (AL6.4)", () => {
  const tooLong = json({ ...LILAS, pad: "x".repeat(1024) });

  it.each([
    ["an empty body", ""],
    ["a body that is not JSON", "text=12 rue des Lilas"],
    // Decoded leniently, the byte would become U+FFFD, and the query a valid one.
    ["a body that is not UTF-8", latin1(json({ text: "12 rue des Lilas é", locale: "fr" }))],
    ["JSON null", "null"],
    ["a text of 2 characters after trim", json({ text: "  12 ", locale: "fr" })],
    ["a text of 121 characters", json({ text: "a".repeat(121), locale: "fr" })],
    ["an unknown locale", json({ ...LILAS, locale: "de" })],
    ["a near out of bounds", json({ ...LILAS, near: { lat: 91, lng: 4.7 } })],
    ["a near that is not a position", json({ ...LILAS, near: "Brindas" })],
    ["a body of 1 025 bytes", json(LILAS) + " ".repeat(1025 - json(LILAS).length)],
  ])("answers 400 invalid for %s, without asking Photon", async (_, body) => {
    const { photon, search } = photonAnswering();
    const response = await handlePlaces(post(body), photon);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ state: "invalid" });
    expect(search).not.toHaveBeenCalled();
  });

  it("answers 400 for a Content-Length beyond 1 024 bytes, before reading the body", async () => {
    let pulled = 0;
    // No queue to fill: it is pulled only when read.
    const body = new ReadableStream(
      {
        pull(controller) {
          pulled++;
          controller.enqueue(new TextEncoder().encode(tooLong));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const { photon, search } = photonAnswering();
    const response = await handlePlaces(post(body, { "content-length": String(tooLong.length) }), photon);
    expect(response.status).toBe(400);
    expect(pulled).toBe(0);
    expect(search).not.toHaveBeenCalled();
  });

  it("stops reading a body without Content-Length beyond 1 024 bytes", async () => {
    let pulled = 0;
    const endless = new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array(256).fill(32));
      },
    });
    const { photon, search } = photonAnswering();
    const response = await handlePlaces(post(endless), photon);
    expect(response.status).toBe(400);
    expect(pulled).toBeLessThan(10);
    expect(search).not.toHaveBeenCalled();
  });
});

describe("what the route leaves", () => {
  it("logs nothing, whatever it answers", async () => {
    const { photon } = photonAnswering();
    await handlePlaces(post(json(LILAS)), photon);
    await handlePlaces(post(json(LILAS), { origin: undefined }), photon);
    await handlePlaces(post(json({ ...LILAS, locale: "de" })), photon);
    await handlePlaces(post(`{"text":"12 rue des Lilas"`), photon);
    expect(logs).toEqual([]);
  });
});

describe("the route", () => {
  it("exports POST only: Next answers 405 to any other method", async () => {
    expect(Object.keys(await import("./route"))).toEqual(["POST"]);
  });
});
