import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { newAdminToken } from "./admin-token";
import { SERVER_TOKEN_BYTES, newServerToken } from "./server-token";

// Spies on the real CSPRNG, so the default byte source is proven, not assumed.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

describe("newServerToken", () => {
  it("carries 128 bits, in canonical base64url (22 characters)", () => {
    expect(SERVER_TOKEN_BYTES * 8).toBe(128);
    const token = newServerToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{21}[AQgw]$/);
    expect(Buffer.from(token, "base64url").length).toBe(16);
  });

  it("draws its 128 bits from the cryptographic generator by default", () => {
    vi.mocked(randomBytes).mockClear();
    newServerToken();
    expect(randomBytes).toHaveBeenCalledExactlyOnceWith(16);
  });

  it("writes the 16 bytes of the source it is given, and only them", () => {
    const sizes: number[] = [];
    const token = newServerToken((size) => {
      sizes.push(size);
      return new Uint8Array(size).fill(0xff);
    });
    expect(sizes).toEqual([16]);
    expect(token).toBe("_____________________w");
  });

  it("refuses a source that gives fewer or more bytes than asked, rather than write a weaker token", () => {
    expect(() => newServerToken(() => new Uint8Array(15))).toThrow(RangeError);
    expect(() => newServerToken(() => new Uint8Array(17))).toThrow(RangeError);
  });

  it("never draws the same token twice", () => {
    const tokens = new Set(Array.from({ length: 1_000 }, () => newServerToken()));
    expect(tokens.size).toBe(1_000);
  });

  it("is the generator of the organiser's token too: one generator for every server token", () => {
    expect(newAdminToken).toBe(newServerToken);
  });
});
