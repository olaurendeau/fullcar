import { describe, expect, it } from "vitest";
import { myEventsRead, openEventCount, shownPast } from "./screen-state";

describe("openEventCount", () => {
  const upcoming = (id: string) => ({ state: "upcoming", id }) as never;
  const past = (id: string) => ({ state: "past", id }) as never;
  const erased = (id: string) => ({ state: "erased", id }) as never;

  // OA9.3: the events whose sign-ups are not erased yet, which stay open to participants.
  it("counts the upcoming and the past events whose sign-ups are not erased, and not the erased ones", () => {
    const list = { email: "a@b.fr", upcoming: [upcoming("a"), upcoming("b")], past: [past("c"), erased("d"), erased("e")] };
    expect(openEventCount(list as never)).toBe(3);
  });
});

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
