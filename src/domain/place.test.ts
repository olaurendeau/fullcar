import { describe, expect, it } from "vitest";
import { nearOf, positionOf, samePlace, samePosition } from "./place";

const LYON = { lat: 45.7581, lng: 4.6894 };

describe("positionOf", () => {
  it("keeps null: no position", () => {
    expect(positionOf(null)).toEqual({ value: null });
  });

  it("reads { lat, lng } of two finite numbers as a position", () => {
    expect(positionOf({ lat: 45.7581, lng: 4.6894 })).toEqual({ value: { lat: 45.7581, lng: 4.6894 } });
  });

  it("reads a position whatever the order of its keys", () => {
    expect(positionOf({ lng: -73.98565, lat: 40.74844 })).toEqual({ value: { lat: 40.74844, lng: -73.98565 } });
  });

  it.each([
    ["no value at all (callers read it as « not sent »)", undefined],
    ["a number", 45.7581],
    ["a string", "45.7581,4.6894"],
    ["a boolean", true],
    ["an array", [45.7581, 4.6894]],
    ["an empty object", {}],
    ["a missing lat", { lng: 4.6894 }],
    ["a missing lng", { lat: 45.7581 }],
    ["a null lat", { lat: null, lng: 4.6894 }],
    ["a null lng", { lat: 45.7581, lng: null }],
    ["a lat as a string", { lat: "45.7581", lng: 4.6894 }],
    ["a lng as a string", { lat: 45.7581, lng: "4.6894" }],
    ["a NaN lat", { lat: Number.NaN, lng: 4.6894 }],
    ["a NaN lng", { lat: 45.7581, lng: Number.NaN }],
    ["an infinite lat", { lat: Number.POSITIVE_INFINITY, lng: 4.6894 }],
    ["an infinite lng", { lat: 45.7581, lng: Number.NEGATIVE_INFINITY }],
    ["a key besides lat and lng", { lat: 45.7581, lng: 4.6894, label: "Brindas" }],
    ["two other keys, lat and lng inherited", Object.assign(Object.create({ lat: 45.7581, lng: 4.6894 }), { a: 1, b: 2 })],
    ["an own lat beside another key, lng inherited", Object.assign(Object.create({ lng: 4.6894 }), { lat: 45.7581, label: "x" })],
    ["an own lng beside another key, lat inherited", Object.assign(Object.create({ lat: 45.7581 }), { lng: 4.6894, label: "x" })],
    [
      "two other keys, lat and lng own but not enumerable",
      Object.defineProperties({ a: 1, b: 2 }, { lat: { value: 45.7581 }, lng: { value: 4.6894 } }),
    ],
  ])("refuses %s as invalid, without throwing", (_, value) => {
    expect(positionOf(value)).toEqual({ error: "invalid" });
  });

  it.each([
    ["the south pole", { lat: -90, lng: 0 }],
    ["the north pole", { lat: 90, lng: 0 }],
    ["the antimeridian, west", { lat: 0, lng: -180 }],
    ["the antimeridian, east", { lat: 0, lng: 180 }],
    ["a longitude beyond ±90", { lat: 0, lng: 100 }],
  ])("accepts %s, inside the bounds", (_, position) => {
    expect(positionOf(position)).toEqual({ value: position });
  });

  it.each([
    ["a latitude below −90", { lat: -90.00001, lng: 0 }],
    ["a latitude above 90", { lat: 90.00001, lng: 0 }],
    ["a latitude beyond ±90 that a longitude could have", { lat: 100, lng: 0 }],
    ["a longitude below −180", { lat: 0, lng: -180.00001 }],
    ["a longitude above 180", { lat: 0, lng: 180.00001 }],
    ["a latitude that would round to 90", { lat: 90.000001, lng: 0 }],
  ])("refuses %s as invalid", (_, value) => {
    expect(positionOf(value)).toEqual({ error: "invalid" });
  });

  it("rounds each coordinate to 5 decimals, to the nearest", () => {
    expect(positionOf({ lat: 45.758126, lng: 4.689444 })).toEqual({ value: { lat: 45.75813, lng: 4.68944 } });
    expect(positionOf({ lat: -33.856784, lng: -151.215296 })).toEqual({ value: { lat: -33.85678, lng: -151.2153 } });
  });

  it("gives the same position when rounding a rounded one", () => {
    const once = positionOf({ lat: 45.758126, lng: 4.689444 });
    expect("value" in once && positionOf(once.value)).toEqual(once);
  });

  it("rounds a coordinate close to zero to 0, not −0", () => {
    expect(positionOf({ lat: -0.000001, lng: -0.000001 })).toEqual({ value: { lat: 0, lng: 0 } });
  });
});

describe("samePosition", () => {
  it("counts two null positions as the same", () => {
    expect(samePosition(null, null)).toBe(true);
  });

  it("counts a position and null as different, in both orders", () => {
    expect(samePosition(LYON, null)).toBe(false);
    expect(samePosition(null, LYON)).toBe(false);
  });

  it("counts the same coordinates at 5 decimals as the same", () => {
    expect(samePosition({ lat: 45.758121, lng: 4.689441 }, { lat: 45.758124, lng: 4.689444 })).toBe(true);
  });

  it("counts a difference at the fifth decimal as different, on each coordinate", () => {
    expect(samePosition({ lat: 45.75812, lng: 4.68944 }, { lat: 45.75813, lng: 4.68944 })).toBe(false);
    expect(samePosition({ lat: 45.75812, lng: 4.68944 }, { lat: 45.75812, lng: 4.68945 })).toBe(false);
  });
});

describe("samePlace", () => {
  it("counts the same text, both without a position, as the same place", () => {
    expect(samePlace({ text: "Brindas", position: null }, { text: "Brindas", position: null })).toBe(true);
  });

  it("counts the same text and the same coordinates at 5 decimals as the same place", () => {
    expect(
      samePlace(
        { text: "12 rue des Lilas, 69126 Brindas", position: { lat: 45.758121, lng: 4.689441 } },
        { text: "12 rue des Lilas, 69126 Brindas", position: { lat: 45.758124, lng: 4.689444 } },
      ),
    ).toBe(true);
  });

  it("counts the same text with another position as changed", () => {
    expect(samePlace({ text: "Brindas", position: LYON }, { text: "Brindas", position: { lat: 45.7581, lng: 4.6895 } })).toBe(false);
  });

  it("counts the same text, with a position on one side only, as changed", () => {
    expect(samePlace({ text: "Brindas", position: LYON }, { text: "Brindas", position: null })).toBe(false);
    expect(samePlace({ text: "Brindas", position: null }, { text: "Brindas", position: LYON })).toBe(false);
  });

  it("counts another text with the same position as changed", () => {
    expect(samePlace({ text: "Brindas", position: LYON }, { text: "Brindas, mairie", position: LYON })).toBe(false);
    expect(samePlace({ text: "Brindas", position: null }, { text: "Vaugneray", position: null })).toBe(false);
  });
});

describe("nearOf", () => {
  it("rounds the event's position to 1 decimal, as Photon receives it (AL4.1)", () => {
    expect(nearOf({ lat: 45.7581, lng: 4.6894 })).toEqual({ lat: 45.8, lng: 4.7 });
  });

  it("rounds each coordinate to the nearest, down as well as up", () => {
    expect(nearOf({ lat: 45.7381, lng: 4.6494 })).toEqual({ lat: 45.7, lng: 4.6 });
    expect(nearOf({ lat: -33.85678, lng: -151.2153 })).toEqual({ lat: -33.9, lng: -151.2 });
  });

  it("rounds a coordinate close to zero to 0, not −0", () => {
    expect(nearOf({ lat: -0.01, lng: -0.04 })).toEqual({ lat: 0, lng: 0 });
  });
});
