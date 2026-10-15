import { randomBytes, timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { devicePersonIds } from "./device";
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
    for (const malformed of [body, `${mine}A`, `${body}B`, `${body}+`, undefined, null, 42, [mine], { toString: () => mine }]) {
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

  // C12.2
  it("compares every hash with timingSafeEqual, whatever the token", () => {
    for (const token of [mine, newToken(), "", undefined]) {
      vi.mocked(timingSafeEqual).mockClear();
      devicePersonIds(token, persons);
      expect(timingSafeEqual).toHaveBeenCalledTimes(persons.length);
    }
  });
});
