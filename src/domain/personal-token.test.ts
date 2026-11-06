import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  creationTokenOf,
  DEVICE_TOKENS_MAX,
  deviceTokensOf,
  isPersonalToken,
  PERSONAL_TOKEN_BYTES,
  personalTokenFromBytes,
} from "./personal-token";
import { browserUnsafe } from "./test-browser-safe";

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

describe("PERSONAL_TOKEN_BYTES", () => {
  // C12.1
  it("is 128 bits", () => {
    expect(PERSONAL_TOKEN_BYTES * 8).toBe(128);
  });
});

describe("personalTokenFromBytes", () => {
  it("writes 16 × 0xff as _____________________w", () => {
    const token = personalTokenFromBytes(new Uint8Array(16).fill(0xff));
    expect(token).toBe("_____________________w");
    expect(isPersonalToken(token)).toBe(true);
  });

  it("writes 16 zero bytes as 22 A", () => {
    expect(personalTokenFromBytes(new Uint8Array(16))).toBe("A".repeat(22));
  });

  // C12.1
  it("is the canonical base64url of its bytes, and always passes isPersonalToken", () => {
    for (let i = 0; i < 1_000; i++) {
      const bytes = new Uint8Array(randomBytes(16));
      const token = personalTokenFromBytes(bytes);
      expect(token).toBe(Buffer.from(bytes).toString("base64url"));
      expect(isPersonalToken(token)).toBe(true);
    }
  });

  it("does not modify the bytes it is given", () => {
    const bytes = new Uint8Array(16).fill(7);
    personalTokenFromBytes(bytes);
    expect(bytes).toEqual(new Uint8Array(16).fill(7));
  });

  it("refuses any other number of bytes rather than write a weaker token", () => {
    for (const size of [0, 15, 17]) {
      expect(() => personalTokenFromBytes(new Uint8Array(size))).toThrow(RangeError);
    }
  });
});

describe("isPersonalToken", () => {
  const token = personalTokenFromBytes(new Uint8Array(randomBytes(16)));

  // C12.1
  it("accepts 22 canonical base64url characters", () => {
    for (const valid of [token, "A".repeat(22), "_____________________w", `${"-".repeat(21)}Q`, `${"z".repeat(21)}g`]) {
      expect(isPersonalToken(valid)).toBe(true);
    }
  });

  // C12.1
  it("refuses 21 and 23 characters", () => {
    expect(isPersonalToken(token.slice(0, 21))).toBe(false);
    expect(isPersonalToken(`${token}A`)).toBe(false);
    expect(isPersonalToken("")).toBe(false);
  });

  // C12.1
  it("refuses a character outside the base64url alphabet, wherever it is", () => {
    for (const outside of ["+", "/", "=", " ", "é", "\n"]) {
      for (let at = 0; at < 22; at++) {
        expect(isPersonalToken("A".repeat(at) + outside + "A".repeat(21 - at))).toBe(false);
      }
    }
  });

  // C12.1: the last character carries 2 bits of the token, and 4 bits that must be zero.
  it("refuses a last character that is not canonical", () => {
    const canonical = new Set("AQgw");
    for (const last of BASE64URL) {
      expect(isPersonalToken("A".repeat(21) + last)).toBe(canonical.has(last));
    }
  });

  // C12.1
  it("refuses, without throwing, anything that is not a string", () => {
    for (const notString of [undefined, null, 42, [token], { toString: () => token }]) {
      expect(isPersonalToken(notString)).toBe(false);
    }
  });
});

function tokens(count: number) {
  return Array.from({ length: count }, () => personalTokenFromBytes(new Uint8Array(randomBytes(16))));
}

// LP5.1: the one reading of the field the browser sends as `token`.
describe("deviceTokensOf", () => {
  it("makes a list of the one well-formed token a page loaded before the deployment sends", () => {
    const [token] = tokens(1);
    expect(deviceTokensOf(token)).toEqual([token]);
  });

  it("reads lists of 1 to DEVICE_TOKENS_MAX well-formed tokens, in order", () => {
    expect(DEVICE_TOKENS_MAX).toBe(20);
    for (const count of [1, 2, 20]) {
      const list = tokens(count);
      expect(deviceTokensOf(list)).toEqual(list);
    }
  });

  it("keeps duplicates in their place", () => {
    const [a, b] = tokens(2);
    expect(deviceTokensOf([a, b, a, a])).toEqual([a, b, a, a]);
  });

  it("reads nothing from 21 tokens, an empty list, or a malformed element", () => {
    const [a] = tokens(1);
    expect(deviceTokensOf(tokens(21))).toBeUndefined();
    expect(deviceTokensOf([])).toBeUndefined();
    for (const bad of ["", a.slice(1), `${a}A`, `${a.slice(0, -1)}B`, 42, null, undefined, { toString: () => a }]) {
      expect(deviceTokensOf([a, bad])).toBeUndefined();
      expect(deviceTokensOf([bad])).toBeUndefined();
    }
  });

  it("reads nothing from a nested list, a number, an object or an absent value", () => {
    const [a] = tokens(1);
    for (const other of [[[a]], 42, { 0: a, length: 1 }, { toString: () => a }, null, undefined, true, ""]) {
      expect(deviceTokensOf(other)).toBeUndefined();
    }
  });

  it("does not hand back the list it was given", () => {
    const list = tokens(2);
    const read = deviceTokensOf(list);
    list.push("x");
    expect(read).toHaveLength(2);
  });
});

describe("creationTokenOf", () => {
  it("is the first token of the list, or the token alone", () => {
    const [a, b] = tokens(2);
    expect(creationTokenOf([a, b])).toBe(a);
    expect(creationTokenOf(b)).toBe(b);
  });

  it("is nothing when the field reads as no token", () => {
    expect(creationTokenOf([])).toBeUndefined();
    expect(creationTokenOf(tokens(21))).toBeUndefined();
    expect(creationTokenOf(undefined)).toBeUndefined();
  });
});

describe("personal-token module", () => {
  const source = readFileSync(new URL("./personal-token.ts", import.meta.url), "utf8");

  it("uses no Node built-in, with or without node:, nor Buffer, so the browser can load it", () => {
    expect(browserUnsafe(source)).toEqual([]);
  });

  it("would be refused with a bare Node built-in injected", () => {
    expect(browserUnsafe(`import { randomBytes } from "crypto";\n${source}`)).toEqual(["crypto"]);
  });
});
