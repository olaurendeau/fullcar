import { describe, expect, it } from "vitest";
import { tileOf } from "./tile";

describe("tileOf", () => {
  it("reads three canonical decimals inside the grid as a tile", () => {
    expect(tileOf({ z: "14", x: "8299", y: "5636" })).toEqual({ z: 14, x: 8299, y: 5636 });
  });

  it("accepts z from 0 to 18", () => {
    expect(tileOf({ z: "0", x: "0", y: "0" })).toEqual({ z: 0, x: 0, y: 0 });
    expect(tileOf({ z: "18", x: "0", y: "0" })).toEqual({ z: 18, x: 0, y: 0 });
  });

  it.each([
    ["−1", "-1"],
    ["19, past the last zoom", "19"],
    ["a decimal", "1.5"],
    ["a leading zero", "01"],
    ["a plus sign", "+1"],
    ["nothing", ""],
    ["a space around it", " 1"],
    ["an exponent", "1e1"],
    ["hexadecimal", "0x1"],
    ["a word", "z"],
  ])("refuses a z of %s", (_, z) => {
    expect(tileOf({ z, x: "0", y: "0" })).toBeNull();
  });

  it.each([
    ["a decimal", "1.5"],
    ["a leading zero", "01"],
    ["a plus sign", "+1"],
    ["a minus sign", "-1"],
    ["nothing", ""],
  ])("refuses an x or a y of %s", (_, value) => {
    expect(tileOf({ z: "14", x: value, y: "0" })).toBeNull();
    expect(tileOf({ z: "14", x: "0", y: value })).toBeNull();
  });

  it.each([0, 1, 14, 18])("at z %i, accepts x and y at 2^z − 1 and refuses them at 2^z", (z) => {
    const last = String(2 ** z - 1);
    const past = String(2 ** z);
    expect(tileOf({ z: String(z), x: last, y: last })).toEqual({ z, x: 2 ** z - 1, y: 2 ** z - 1 });
    expect(tileOf({ z: String(z), x: past, y: "0" })).toBeNull();
    expect(tileOf({ z: String(z), x: "0", y: past })).toBeNull();
  });

  it("refuses a number too large to be exact", () => {
    expect(tileOf({ z: "18", x: "99999999999999999999", y: "0" })).toBeNull();
  });
});
