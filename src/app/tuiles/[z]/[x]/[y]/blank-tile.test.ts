import { crc32, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BLANK_TILE } from "./blank-tile";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** The chunks of a PNG, each with its CRC checked. */
function chunksOf(png: Uint8Array): { type: string; data: Buffer }[] {
  const bytes = Buffer.from(png);
  const chunks: { type: string; data: Buffer }[] = [];
  let at = SIGNATURE.length;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const typeAndData = bytes.subarray(at + 4, at + 8 + length);
    expect(bytes.readUInt32BE(at + 8 + length)).toBe(crc32(typeAndData));
    chunks.push({ type: typeAndData.subarray(0, 4).toString("latin1"), data: typeAndData.subarray(4) });
    at += 12 + length;
  }
  expect(at).toBe(bytes.length);
  return chunks;
}

describe("the blank tile", () => {
  const chunks = chunksOf(BLANK_TILE);
  const header = chunks[0].data;

  it("is a PNG: its signature, then IHDR first and IEND last", () => {
    expect([...BLANK_TILE.subarray(0, 8)]).toEqual(SIGNATURE);
    expect(chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("is 256 × 256", () => {
    expect(header.readUInt32BE(0)).toBe(256);
    expect(header.readUInt32BE(4)).toBe(256);
  });

  it("is transparent: RGBA of 8 bits, each pixel's alpha 0", () => {
    expect([header[8], header[9]]).toEqual([8, 6]);
    const rows = inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data)));
    expect(rows.length).toBe(256 * (1 + 256 * 4));
    expect(rows.every((byte) => byte === 0)).toBe(true);
  });
});
