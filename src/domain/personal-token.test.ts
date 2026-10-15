import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPersonalToken, PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "./personal-token";
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

describe("personal-token module", () => {
  const source = readFileSync(new URL("./personal-token.ts", import.meta.url), "utf8");

  it("uses no Node built-in, with or without node:, nor Buffer, so the browser can load it", () => {
    expect(browserUnsafe(source)).toEqual([]);
  });

  it("would be refused with a bare Node built-in injected", () => {
    expect(browserUnsafe(`import { randomBytes } from "crypto";\n${source}`)).toEqual(["crypto"]);
  });
});
