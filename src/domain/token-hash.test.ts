import { timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { adminTokenMatches, hashAdminToken } from "./admin-token";
import { hashToken, tokenMatches } from "./token-hash";

// Spies on the real comparison, so constant time is proven, not assumed.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

describe("hashToken", () => {
  it("is the SHA-256 of the token, in hex", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("tokenMatches", () => {
  it("accepts the right token and refuses another", () => {
    const stored = hashToken("abc");
    expect(tokenMatches("abc", stored)).toBe(true);
    expect(tokenMatches("abd", stored)).toBe(false);
  });

  it("compares with timingSafeEqual, whether the token matches or not", () => {
    vi.mocked(timingSafeEqual).mockClear();
    tokenMatches("abc", hashToken("abc"));
    tokenMatches("abd", hashToken("abc"));
    tokenMatches(undefined, "not a hash");
    expect(timingSafeEqual).toHaveBeenCalledTimes(3);
  });
});

describe("admin-token", () => {
  it("re-exports the shared hash and comparison under its own names", () => {
    expect(hashAdminToken).toBe(hashToken);
    expect(adminTokenMatches).toBe(tokenMatches);
  });
});
