import { randomBytes, timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { deviceAccess, devicePersonIds, deviceTokenRanks, eventAccess } from "./device";
import { isPersonalToken, personalTokenFromBytes } from "./personal-token";
import { hashToken } from "./token-hash";

// Spies on the real comparison, so constant time is proven, not assumed.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

function newToken() {
  return personalTokenFromBytes(new Uint8Array(randomBytes(16)));
}

/** Changes one character of `token`, keeping it well formed, so that the hash is what refuses it. */
function oneCharOff(token: string, at: number) {
  const last = at === token.length - 1;
  const swapped = token[at] === "A" ? (last ? "Q" : "B") : "A";
  return token.slice(0, at) + swapped + token.slice(at + 1);
}

describe("devicePersonIds", () => {
  const mine = newToken();
  const theirs = newToken();
  const persons = [
    { id: "p1", tokenHash: hashToken(mine) },
    { id: "p2", tokenHash: hashToken(theirs) },
    { id: "p3", tokenHash: hashToken(mine) },
  ];

  // C12.2
  it("returns every person whose hash is that of the token", () => {
    expect(devicePersonIds(mine, persons)).toEqual(["p1", "p3"]);
    expect(devicePersonIds(theirs, persons)).toEqual(["p2"]);
  });

  // C12.2
  it("returns nobody for a wrong token", () => {
    expect(devicePersonIds(newToken(), persons)).toEqual([]);
  });

  // C12.2
  it("returns nobody for an empty token, even when its hash is stored", () => {
    expect(devicePersonIds("", persons)).toEqual([]);
    expect(devicePersonIds("", [{ id: "p0", tokenHash: hashToken("") }])).toEqual([]);
  });

  // C12.2
  it("returns nobody for a token one character off, wherever the character is", () => {
    for (let at = 0; at < mine.length; at++) {
      const off = oneCharOff(mine, at);
      expect(isPersonalToken(off)).toBe(true);
      expect(devicePersonIds(off, persons)).toEqual([]);
    }
  });

  // C12.1, C12.2
  it("returns nobody for a malformed token, even when its hash is stored", () => {
    const body = mine.slice(0, -1);
    for (const malformed of [body, `${mine}A`, `${body}B`, `${body}+`, undefined, null, 42, [], [[mine]], [body], [mine, body], { toString: () => mine }]) {
      const stored = typeof malformed === "string" ? [{ id: "px", tokenHash: hashToken(malformed) }] : [];
      expect(devicePersonIds(malformed, [...persons, ...stored])).toEqual([]);
    }
  });

  // C12.2
  it("skips, without throwing, a stored hash that is malformed", () => {
    const hash = hashToken(mine);
    const malformed = ["", "abc", hash.slice(0, -2), `${hash}00`, hash.toUpperCase(), "zz".repeat(32)];
    const withMalformed = malformed.map((tokenHash, i) => ({ id: `m${i}`, tokenHash }));
    expect(() => devicePersonIds(mine, withMalformed)).not.toThrow();
    expect(devicePersonIds(mine, [...withMalformed, persons[0]])).toEqual(["p1"]);
  });

  it("returns nobody when the event has no person", () => {
    expect(devicePersonIds(mine, [])).toEqual([]);
  });

  // LP5.1: a device holding A and B sees what the devices of A and of B each see.
  it("returns the union of the persons of two tokens, in the event's order", () => {
    expect(devicePersonIds([mine, theirs], persons)).toEqual(["p1", "p2", "p3"]);
    expect(devicePersonIds([theirs, mine], persons)).toEqual(["p1", "p2", "p3"]);
    expect(devicePersonIds([mine, newToken()], persons)).toEqual(["p1", "p3"]);
    expect(devicePersonIds([mine, mine], persons)).toEqual(["p1", "p3"]);
  });

  // LP5.1
  it("returns nobody for a list that reads as no token: empty, over 20, or with a malformed element", () => {
    const twentyOne = Array.from({ length: 21 }, () => mine);
    expect(devicePersonIds([], persons)).toEqual([]);
    expect(devicePersonIds(twentyOne, persons)).toEqual([]);
    expect(devicePersonIds(twentyOne.slice(0, 20), persons)).toEqual(["p1", "p3"]);
    expect(devicePersonIds([mine, "nope"], persons)).toEqual([]);
  });

  // LP5.1
  it("compares every hash with every token, with no early exit", () => {
    for (const list of [[mine, theirs], [theirs, mine, newToken()], [mine, mine]]) {
      vi.mocked(timingSafeEqual).mockClear();
      devicePersonIds(list, persons);
      expect(timingSafeEqual).toHaveBeenCalledTimes(persons.length * list.length);
    }
  });

  // C12.2
  it("compares every hash with timingSafeEqual, whatever the token", () => {
    for (const token of [mine, newToken(), "", undefined]) {
      vi.mocked(timingSafeEqual).mockClear();
      devicePersonIds(token, persons);
      expect(timingSafeEqual).toHaveBeenCalledTimes(persons.length);
    }
  });
});

// RP5.4: a person gone from the event is told apart from a person of another token.
describe("deviceAccess", () => {
  const mine = newToken();
  const theirs = newToken();
  const persons = [
    { id: "p1", tokenHash: hashToken(mine) },
    { id: "p2", tokenHash: hashToken(theirs) },
    { id: "p3", tokenHash: hashToken(mine) },
  ];

  it("grants persons all of the token's", () => {
    expect(deviceAccess(mine, persons, ["p3", "p1"])).toEqual({ kind: "device" });
  });

  it("refuses a person of another token as forbidden", () => {
    expect(deviceAccess(mine, persons, ["p1", "p2"])).toEqual({ kind: "forbidden" });
    expect(deviceAccess(newToken(), persons, ["p1"])).toEqual({ kind: "forbidden" });
  });

  it("says which persons are gone from the event, in the order asked, with a well-formed token", () => {
    expect(deviceAccess(mine, persons, ["gone2", "p1", "gone1"])).toEqual({ kind: "personGone", goneIds: ["gone2", "gone1"] });
    // A device whose last person was removed keeps its token (Q3 = a), which nobody holds any more.
    expect(deviceAccess(newToken(), [], ["p1"])).toEqual({ kind: "personGone", goneIds: ["p1"] });
  });

  it("refuses as forbidden, before personGone, a request with a person of another token", () => {
    expect(deviceAccess(mine, persons, ["gone", "p2"])).toEqual({ kind: "forbidden" });
  });

  // LP5.1
  it("grants the person of the second token, and refuses the one of a token not sent", () => {
    expect(deviceAccess([newToken(), theirs], persons, ["p2"])).toEqual({ kind: "device" });
    expect(deviceAccess([mine, theirs], persons, ["p1", "p2", "p3"])).toEqual({ kind: "device" });
    expect(deviceAccess([mine, newToken()], persons, ["p1", "p2"])).toEqual({ kind: "forbidden" });
    expect(deviceAccess([theirs, newToken()], persons, ["gone", "p1"])).toEqual({ kind: "forbidden" });
  });

  // LP5.1
  it("refuses as forbidden a list that reads as no token", () => {
    expect(deviceAccess([], persons, ["gone"])).toEqual({ kind: "forbidden" });
    expect(deviceAccess([mine, "nope"], persons, ["p1"])).toEqual({ kind: "forbidden" });
    expect(deviceAccess(Array.from({ length: 21 }, () => mine), persons, ["p1"])).toEqual({ kind: "forbidden" });
  });

  it("refuses as forbidden a malformed or absent token, whoever is asked", () => {
    for (const token of [mine.slice(1), "", undefined]) {
      expect(deviceAccess(token, persons, ["gone"])).toEqual({ kind: "forbidden" });
      expect(deviceAccess(token, persons, ["p1"])).toEqual({ kind: "forbidden" });
    }
  });
});

// LP5.1, LP5.3: the rank of the first token that holds each person of the device.
describe("deviceTokenRanks", () => {
  const a = newToken();
  const b = newToken();
  const persons = [
    { id: "pa", tokenHash: hashToken(a) },
    { id: "pb", tokenHash: hashToken(b) },
    { id: "pc", tokenHash: hashToken(newToken()) },
    { id: "pb2", tokenHash: hashToken(b) },
  ];

  it("gives each person of the device the rank of her token in the list", () => {
    expect(deviceTokenRanks([a, b], persons)).toEqual({ pa: 0, pb: 1, pb2: 1 });
    expect(deviceTokenRanks([b, a], persons)).toEqual({ pa: 1, pb: 0, pb2: 0 });
  });

  it("keeps the first rank of a duplicated token", () => {
    expect(deviceTokenRanks([a, b, a], persons)).toEqual({ pa: 0, pb: 1, pb2: 1 });
    expect(deviceTokenRanks([b, b, a], persons)).toEqual({ pa: 2, pb: 0, pb2: 0 });
  });

  it("leaves out a token that holds nobody, and the persons of no token sent", () => {
    expect(deviceTokenRanks([newToken(), b], persons)).toEqual({ pb: 1, pb2: 1 });
    expect(deviceTokenRanks(a, persons)).toEqual({ pa: 0 });
  });

  it("is empty for a field that reads as no token", () => {
    for (const none of [undefined, [], [a, "nope"], Array.from({ length: 21 }, () => a), 42]) {
      expect(deviceTokenRanks(none, persons)).toEqual({});
    }
  });
});

// Epic #973: placing is open to whoever has the link; only the event's membership is checked.
describe("eventAccess", () => {
  const persons = [{ id: "p1" }, { id: "p2" }];

  it("grants persons all of the event's, whatever token holds them", () => {
    expect(eventAccess(persons, ["p2", "p1"])).toEqual({ kind: "event" });
  });

  it("says which persons are gone from the event, in the order asked", () => {
    expect(eventAccess(persons, ["gone2", "p1", "gone1"])).toEqual({ kind: "personGone", goneIds: ["gone2", "gone1"] });
    expect(eventAccess([], ["p1"])).toEqual({ kind: "personGone", goneIds: ["p1"] });
  });
});
