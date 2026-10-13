import { describe, expect, it } from "vitest";
import { adminTokenMatches, hashAdminToken, newAdminToken } from "./admin-token";

/** Flips one character of `token` to another base64url character. */
function oneCharOff(token: string, at: number) {
  const swapped = token[at] === "A" ? "B" : "A";
  return token.slice(0, at) + swapped + token.slice(at + 1);
}

describe("newAdminToken", () => {
  // C8.3
  it("carries at least 128 bits, in base64url", () => {
    const token = newAdminToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(token, "base64url").length * 8).toBeGreaterThanOrEqual(128);
  });

  it("draws 16 bytes from the source it is given", () => {
    const sizes: number[] = [];
    const token = newAdminToken((size) => {
      sizes.push(size);
      return new Uint8Array(size).fill(0xff);
    });
    expect(sizes).toEqual([16]);
    expect(token).toBe("_____________________w");
  });

  it("never draws the same token twice", () => {
    const tokens = new Set(Array.from({ length: 1_000 }, () => newAdminToken()));
    expect(tokens.size).toBe(1_000);
  });
});

describe("hashAdminToken", () => {
  it("is the SHA-256 of the token, in hex", () => {
    expect(hashAdminToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  // C8.3
  it("differs from the token and does not contain it", () => {
    const token = newAdminToken();
    const hash = hashAdminToken(token);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same hash for the same token", () => {
    const token = newAdminToken();
    expect(hashAdminToken(token)).toBe(hashAdminToken(token));
  });
});

describe("adminTokenMatches", () => {
  const token = newAdminToken();
  const stored = hashAdminToken(token);

  // C8.4
  it("accepts the right token", () => {
    expect(adminTokenMatches(token, stored)).toBe(true);
  });

  it("refuses a wrong token", () => {
    expect(adminTokenMatches(newAdminToken(), stored)).toBe(false);
  });

  it("refuses an empty token", () => {
    expect(adminTokenMatches("", stored)).toBe(false);
  });

  it("refuses a token one character off, wherever the character is", () => {
    for (let at = 0; at < token.length; at++) {
      expect(adminTokenMatches(oneCharOff(token, at), stored)).toBe(false);
    }
  });

  it("refuses a token one character too short or too long", () => {
    expect(adminTokenMatches(token.slice(0, -1), stored)).toBe(false);
    expect(adminTokenMatches(`${token}A`, stored)).toBe(false);
  });

  it("refuses the stored hash given as the token", () => {
    expect(adminTokenMatches(stored, stored)).toBe(false);
  });

  it("refuses, without throwing, a stored hash that is not a SHA-256", () => {
    for (const malformed of ["", "abc", stored.slice(0, -2), `${stored}00`, stored.toUpperCase(), "zz".repeat(32)]) {
      expect(() => adminTokenMatches(token, malformed)).not.toThrow();
      expect(adminTokenMatches(token, malformed)).toBe(false);
    }
  });
});
