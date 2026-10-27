import { describe, expect, it } from "vitest";
import { myEventsRead, shownPast } from "./screen-state";

const LIST = { state: "events", email: "camille@exemple.fr", upcoming: [], past: [] } as const;

describe("myEventsRead", () => {
  it("OA6.8: leads to /connexion without a token, and when the server answers signIn", () => {
    expect(myEventsRead(undefined)).toEqual({ state: "signIn" });
    expect(myEventsRead({ ok: true, value: { state: "signIn" } })).toEqual({ state: "signIn" });
  });

  it("OA6.1: gives the list the server answered", () => {
    expect(myEventsRead({ ok: true, value: LIST })).toEqual({ state: "events", list: LIST });
  });

  it.each([
    ["offline", { ok: false, problem: "offline" } as const],
    ["a failed request", { ok: false, problem: "failed" } as const],
    ["no answer", { ok: true, value: undefined } as const],
    ["an answer of another shape", { ok: true, value: { state: "events" } } as const],
  ])("OA6.7: reads %s as a failure, which says nothing of the session", (_, sent) => {
    expect(myEventsRead(sent)).toEqual({ state: "failed" });
  });
});

describe("shownPast", () => {
  const past = Array.from({ length: 12 }, (_, n) => n);

  it("OA6.6: 10 shown, and how many more", () => {
    expect(shownPast(past, false)).toEqual({ shown: past.slice(0, 10), more: 2 });
  });

  it("OA6.6: all of them once « Afficher les autres » is tapped, or with 10 at most", () => {
    expect(shownPast(past, true)).toEqual({ shown: past, more: 0 });
    expect(shownPast(past.slice(0, 10), false)).toEqual({ shown: past.slice(0, 10), more: 0 });
  });
});
