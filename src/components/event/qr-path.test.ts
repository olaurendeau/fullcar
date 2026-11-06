import { describe, expect, it } from "vitest";
import { encode } from "uqr";
import { qrPath } from "./qr-path";

const TAIL = "abcdefghijklmnopqrstuv";
const LINK = `https://fullcar.example/e/AbCdEfGh/moi#${TAIL}`;

/** One `M…` per dark module drawn. */
function drawn(d: string): number {
  return d.split("M").length - 1;
}

describe("qrPath", () => {
  it("draws the same text the same way, and two texts differently", () => {
    expect(qrPath(LINK)).toEqual(qrPath(LINK));
    expect(qrPath(LINK).d).not.toBe(qrPath(`${LINK}x`).d);
  });

  it("draws exactly the dark modules of the matrix", () => {
    const dark = encode(LINK, { ecc: "M" }).data.flat().filter(Boolean).length;
    expect(drawn(qrPath(LINK).d)).toBe(dark);
  });

  it("keeps a quiet zone of exactly 4 modules around the matrix", () => {
    const { data } = encode(LINK, { ecc: "M", border: 0 });
    const { size, d } = qrPath(LINK);
    expect(size).toBe(data.length + 8);
    expect(size).toBeGreaterThanOrEqual(29);
    const coords = [...d.matchAll(/M(\d+) (\d+)/g)].flatMap(([, x, y]) => [+x, +y]);
    // The finder patterns put a dark module on every edge of the matrix.
    expect(Math.min(...coords)).toBe(4);
    expect(Math.max(...coords)).toBe(size - 5);
  });

  it("does not carry the text, nor its last 22 characters", () => {
    const { d } = qrPath(LINK);
    expect(d).not.toContain(LINK);
    expect(d).not.toContain(TAIL);
    expect(d).toMatch(/^[Mhvz0-9 -]*$/);
  });
});
