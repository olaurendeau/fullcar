import { describe, expect, it } from "vitest";
import { generatePublicId, isPublicId, PUBLIC_ID_ALPHABET } from "./public-id";

const FORMAT = /^[2-9A-HJ-NP-Za-km-z]{8}$/;

/** A byte source that replays `bytes`, whatever size is asked. */
function replay(bytes: number[]) {
  let next = 0;
  return (size: number) => {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) out[i] = bytes[next++ % bytes.length];
    return out;
  };
}

describe("PUBLIC_ID_ALPHABET", () => {
  it("has 57 distinct symbols, none of 0 O 1 l I", () => {
    expect(PUBLIC_ID_ALPHABET).toHaveLength(57);
    expect(new Set(PUBLIC_ID_ALPHABET).size).toBe(57);
    for (const ambiguous of "0O1lI") expect(PUBLIC_ID_ALPHABET).not.toContain(ambiguous);
  });
});

describe("generatePublicId", () => {
  // C8.1
  it("draws 10 000 ids in the format, using the whole alphabet", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const id = generatePublicId();
      expect(id).toMatch(FORMAT);
      for (const symbol of id) seen.add(symbol);
    }
    expect([...seen].sort().join("")).toBe([...PUBLIC_ID_ALPHABET].sort().join(""));
  });

  it("maps each accepted byte to one symbol", () => {
    expect(generatePublicId(replay([0, 1, 2, 3, 4, 5, 6, 7]))).toBe("23456789");
    expect(generatePublicId(replay([56, 57, 227]))).toBe("z2zz2zz2");
  });

  it("rejects the bytes that would bias the draw instead of folding them", () => {
    // 228 = 4 × 57: the bytes from 228 to 255 would favour the first 28 symbols.
    const biased = Array.from({ length: 28 }, (_, i) => 228 + i);
    expect(generatePublicId(replay([...biased, 8, 9, 10, 11, 12, 13, 14, 15]))).toBe("ABCDEFGH");
  });

  it("asks the source again when a whole batch is rejected", () => {
    const sizes: number[] = [];
    const source = replay([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0]);
    const id = generatePublicId((size) => {
      sizes.push(size);
      return source(size);
    });
    expect(id).toBe("22222222");
    expect(sizes.length).toBeGreaterThan(1);
  });
});

describe("isPublicId", () => {
  it("accepts a well-formed id", () => {
    expect(isPublicId("23456789")).toBe(true);
    expect(isPublicId("AbCdEfGh")).toBe(true);
    expect(isPublicId(generatePublicId())).toBe(true);
  });

  it.each(["0", "O", "1", "l", "I"])("refuses the ambiguous symbol %s", (ambiguous) => {
    expect(isPublicId(`${ambiguous}2345678`)).toBe(false);
    expect(isPublicId(`2345678${ambiguous}`)).toBe(false);
  });

  it("refuses a wrong length", () => {
    expect(isPublicId("")).toBe(false);
    expect(isPublicId("2345678")).toBe(false);
    expect(isPublicId("234567892")).toBe(false);
  });

  it.each(["-", "_", " ", "é", "/", ".", "\n"])("refuses %j, outside the alphabet", (outside) => {
    expect(isPublicId(`234${outside}5678`)).toBe(false);
  });

  it("refuses a valid id followed by a newline", () => {
    expect(isPublicId("23456789\n")).toBe(false);
  });
});
