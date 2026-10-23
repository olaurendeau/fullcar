import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceQuery } from "@/domain/suggestion";
import { createPlaceSearch, type PlaceSearchResult } from "./place-search";

const SALLE = { label: "Salle des fêtes, 69126 Brindas", lat: 45.71989, lng: 4.69613 };

function query(text: string, near: PlaceQuery["near"] = null): PlaceQuery {
  return { text, locale: "fr", near };
}

/** A `fetch` that answers what it is told, when it is told; each call kept, its signal with it. */
function fakeFetch() {
  const calls: { url: string; init: RequestInit; answer: (response: Response) => void; fail: (error: unknown) => void }[] = [];
  const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      calls.push({ url: String(url), init: init ?? {}, answer: resolve, fail: reject });
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  });
  return { fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A search with its fetch, its connection, and what it told the field. */
function setUp({ online = true } = {}) {
  const fake = fakeFetch();
  const answers: [string, PlaceSearchResult][] = [];
  const searching: string[] = [];
  const search = createPlaceSearch(
    { fetch: fake.fetch, onLine: () => online },
    { answered: (text, result) => void answers.push([text, result]), searching: (text) => void searching.push(text) },
  );
  return { ...fake, answers, searching, search };
}

/** Lets the promises of an answer run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("createPlaceSearch", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("asks POST /api/lieux 300 ms after the last keystroke, the text in the JSON body, never in the URL", async () => {
    const { search, calls } = setUp();
    search.typed("12 rue des Lilas", query("12 rue des Lilas", { lat: 45.8, lng: 4.7 }));
    await vi.advanceTimersByTimeAsync(299);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe("/api/lieux");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ text: "12 rue des Lilas", locale: "fr", near: { lat: 45.8, lng: 4.7 } });
  });

  it("sends no near when there is none", async () => {
    const { search, calls } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: "Brindas", locale: "fr" });
  });

  it("asks once per pause: each keystroke restarts it", async () => {
    const { search, calls } = setUp();
    for (const text of ["Sal", "Sall", "Salle", "Salle "]) {
      search.typed(text, query(text));
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init.body)).text).toBe("Salle ");
  });

  it("asks nothing for a keystroke without a query, and abandons the pause before it", async () => {
    const { search, calls } = setUp();
    search.typed("Bri", query("Bri"));
    await vi.advanceTimersByTimeAsync(100);
    search.typed("Br", null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(0);
  });

  it("gives the answer for the text it was asked for", async () => {
    const { search, calls, answers } = setUp();
    search.typed("Salle des f", query("Salle des f"));
    await vi.advanceTimersByTimeAsync(300);
    calls[0].answer(json({ state: "ok", suggestions: [SALLE] }));
    await settle();
    expect(answers).toEqual([["Salle des f", { state: "ok", suggestions: [SALLE] }]]);
  });

  it("gives an empty answer as no suggestion", async () => {
    const { search, calls, answers } = setUp();
    search.typed("Nulle part", query("Nulle part"));
    await vi.advanceTimersByTimeAsync(300);
    calls[0].answer(json({ state: "ok", suggestions: [] }));
    await settle();
    expect(answers).toEqual([["Nulle part", { state: "ok", suggestions: [] }]]);
  });

  it("keeps one request at a time: a keystroke abandons the one out, which gives nothing", async () => {
    const { search, calls, answers } = setUp();
    search.typed("Salle des f", query("Salle des f"));
    await vi.advanceTimersByTimeAsync(300);
    search.typed("Salle des fê", query("Salle des fê"));
    expect(calls[0].init.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toHaveLength(2);
    calls[1].answer(json({ state: "ok", suggestions: [SALLE] }));
    await settle();
    expect(answers).toEqual([["Salle des fê", { state: "ok", suggestions: [SALLE] }]]);
  });

  it("says it is searching after 1 s without an answer, and never sooner", async () => {
    const { search, calls, searching } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300 + 999);
    expect(searching).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(searching).toEqual(["Brindas"]);
    calls[0].answer(json({ state: "ok", suggestions: [] }));
    await settle();
    expect(searching).toEqual(["Brindas"]);
  });

  it("does not say it is searching for an answer in less than 1 s", async () => {
    const { search, calls, searching } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300 + 500);
    calls[0].answer(json({ state: "ok", suggestions: [] }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(searching).toEqual([]);
  });

  it("abandons a request after 3 s: unavailable", async () => {
    const { search, calls, answers } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300 + 2999);
    expect(answers).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls[0].init.signal?.aborted).toBe(true);
    expect(answers).toEqual([["Brindas", { state: "unavailable" }]]);
  });

  it("offline: no request, unavailable after the pause", async () => {
    const { search, calls, answers } = setUp({ online: false });
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(299);
    expect(answers).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(0);
    expect(answers).toEqual([["Brindas", { state: "unavailable" }]]);
  });

  it.each([
    ["a 500", () => new Response("", { status: 500 })],
    ["a 502 whose body reads as ok", () => json({ state: "ok", suggestions: [SALLE] }, 502)],
    ["unavailable with suggestions", () => json({ state: "unavailable", suggestions: [SALLE] })],
    ["suggestions that are not a list", () => json({ state: "ok", suggestions: { 0: SALLE, length: 1 } })],
    ["a 400", () => json({ state: "invalid" }, 400)],
    ["unavailable", () => json({ state: "unavailable" })],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
    ["an ok without suggestions", () => json({ state: "ok" })],
    ["a suggestion without a label", () => json({ state: "ok", suggestions: [{ lat: 45.7, lng: 4.6 }] })],
    ["a suggestion with an empty label", () => json({ state: "ok", suggestions: [{ ...SALLE, label: "" }] })],
    ["a suggestion out of bounds", () => json({ state: "ok", suggestions: [{ ...SALLE, lat: 91 }] })],
    ["a suggestion that is not a position", () => json({ state: "ok", suggestions: [{ ...SALLE, lng: "4.6" }] })],
    ["a suggestion that is null", () => json({ state: "ok", suggestions: [null] })],
  ])("reads %s as unavailable", async (_, response) => {
    const { search, calls, answers } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300);
    calls[0].answer(response());
    await settle();
    expect(answers).toEqual([["Brindas", { state: "unavailable" }]]);
  });

  it("reads a request that fails, the network gone, as unavailable", async () => {
    const { search, calls, answers } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300);
    calls[0].fail(new TypeError("Failed to fetch"));
    await settle();
    expect(answers).toEqual([["Brindas", { state: "unavailable" }]]);
  });

  it("gives an answer once, and nothing after the 3 s once answered", async () => {
    const { search, calls, answers, searching } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300);
    calls[0].answer(json({ state: "ok", suggestions: [SALLE] }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(answers).toEqual([["Brindas", { state: "ok", suggestions: [SALLE] }]]);
    expect(searching).toEqual([]);
  });

  it("leaves no timer behind once answered, or once 3 s have passed", async () => {
    const { search, calls } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300);
    calls[0].answer(json({ state: "ok", suggestions: [] }));
    await settle();
    expect(vi.getTimerCount()).toBe(0);
    search.typed("Brindas ", query("Brindas "));
    await vi.advanceTimersByTimeAsync(300 + 3000);
    expect(vi.getTimerCount()).toBe(0);
  });

  /** A search whose `fetch` does not heed its signal: it answers `body` after `ms`, whatever happens. */
  function deafSetUp(ms: number, body: unknown) {
    const answers: unknown[] = [];
    const searching: string[] = [];
    const deaf = vi.fn(() => new Promise<Response>((resolve) => setTimeout(() => resolve(json(body)), ms)));
    const search = createPlaceSearch(
      { fetch: deaf, onLine: () => true },
      { answered: (...answer) => void answers.push(answer), searching: (text) => void searching.push(text) },
    );
    return { search, answers, searching };
  }

  it("stop: gives nothing, even from a fetch that does not heed its signal and answers later", async () => {
    const { search, answers, searching } = deafSetUp(500, { state: "ok", suggestions: [SALLE] });
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300);
    search.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(answers).toEqual([]);
    expect(searching).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("3 s: unavailable, even from a fetch that does not heed its signal, and its later answer is dropped", async () => {
    const { search, answers } = deafSetUp(5000, { state: "ok", suggestions: [SALLE] });
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300 + 3000);
    expect(answers).toEqual([["Brindas", { state: "unavailable" }]]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(answers).toEqual([["Brindas", { state: "unavailable" }]]);
  });

  it("stop: abandons the pause and the request out, and gives nothing", async () => {
    const { search, calls, answers, searching } = setUp();
    search.typed("Brindas", query("Brindas"));
    await vi.advanceTimersByTimeAsync(300);
    search.typed("Brindas ", query("Brindas "));
    search.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.signal?.aborted).toBe(true);
    expect(answers).toEqual([]);
    expect(searching).toEqual([]);
  });
});
