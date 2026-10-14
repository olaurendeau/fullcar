import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isCreationId, uuidV4FromBytes } from "./creation-id";

describe("uuidV4FromBytes", () => {
  it("writes 16 zero bytes with only the version and variant bits set", () => {
    expect(uuidV4FromBytes(new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("writes 16 × 0xff with the version and variant bits forced", () => {
    expect(uuidV4FromBytes(new Uint8Array(16).fill(0xff))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  // C12.4
  it("sets the version 4 and variant bits, and keeps the 122 others, whatever the bytes", () => {
    for (let i = 0; i < 1_000; i++) {
      const bytes = new Uint8Array(randomBytes(16));
      const id = uuidV4FromBytes(bytes);
      expect(isCreationId(id)).toBe(true);
      const back = new Uint8Array(Buffer.from(id.replaceAll("-", ""), "hex"));
      expect(back[6] >> 4).toBe(0b0100);
      expect(back[8] >> 6).toBe(0b10);
      back[6] = (back[6] & 0x0f) | (bytes[6] & 0xf0);
      back[8] = (back[8] & 0x3f) | (bytes[8] & 0xc0);
      expect(back).toEqual(bytes);
    }
  });

  it("does not modify the bytes it is given", () => {
    const bytes = new Uint8Array(16).fill(0xff);
    uuidV4FromBytes(bytes);
    expect(bytes).toEqual(new Uint8Array(16).fill(0xff));
  });

  it("refuses any other number of bytes", () => {
    for (const size of [0, 15, 17]) {
      expect(() => uuidV4FromBytes(new Uint8Array(size))).toThrow(RangeError);
    }
  });
});

describe("isCreationId", () => {
  const id = uuidV4FromBytes(new Uint8Array(randomBytes(16)));

  it("accepts a lowercase uuid v4", () => {
    expect(isCreationId(id)).toBe(true);
  });

  // C12.4
  it("refuses any other form", () => {
    for (const other of [
      "",
      id.slice(0, -1),
      `${id}0`,
      id.toUpperCase(),
      id.replaceAll("-", ""),
      `{${id}}`,
      "00000000-0000-1000-8000-000000000000", // version 1
      "00000000-0000-4000-c000-000000000000", // another variant
      "00000000-0000-4000-8000-00000000000g",
      "00000000-0000-0000-0000-000000000000",
    ]) {
      expect(isCreationId(other)).toBe(false);
    }
  });

  it("refuses, without throwing, anything that is not a string", () => {
    for (const notString of [undefined, null, 42, [id], { toString: () => id }]) {
      expect(isCreationId(notString)).toBe(false);
    }
  });
});

describe("creation-id module", () => {
  it("uses neither node: nor Buffer, so the browser can load it", () => {
    const source = readFileSync(new URL("./creation-id.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/["']node:/);
    expect(source).not.toMatch(/\bBuffer\b/);
  });
});
