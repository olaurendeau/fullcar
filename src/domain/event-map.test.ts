import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUBBLE_INSET, bubbleMaxHeight, distanceMetres, framing, mapOf, SAME_POSITION_METRES, type EventMapPoints } from "./event-map";
import type { Position } from "./place";
import { browserUnsafe } from "./test-browser-safe";

/** The event's place: the flag. */
const FLAG: Position = { lat: 45.764, lng: 4.8357 };
/** About 12 km from the flag. */
const BRINDAS: Position = { lat: 45.7196, lng: 4.6975 };
const VAUGNERAY: Position = { lat: 45.7378, lng: 4.6564 };
const ECULLY: Position = { lat: 45.7744, lng: 4.7775 };

/** The metres of a degree of latitude, on the sphere of `distanceMetres`. */
const METRES_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;

/** `metres` to the north of `from`. */
function north(from: Position, metres: number): Position {
  return { lat: from.lat + metres / METRES_PER_DEGREE, lng: from.lng };
}

/** `metres` to the east of `from`. */
function east(from: Position, metres: number): Position {
  return { lat: from.lat, lng: from.lng + metres / (METRES_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180)) };
}

interface Car {
  id: string;
  position: Position | null;
}

function car(id: string, position: Position | null): Car {
  return { id, position };
}

/** Each point's cars, by id, in the order of the points. */
function idsOf(map: EventMapPoints<Car>): string[][] {
  return map.points.map((point) => point.cars.map((each) => each.id));
}

describe("distanceMetres", () => {
  it.each<[string, Position, Position, number]>([
    ["a minute of latitude, a nautical mile", { lat: 45, lng: 4 }, { lat: 45 + 1 / 60, lng: 4 }, 1852],
    ["a degree of longitude at 45°", { lat: 45, lng: 4 }, { lat: 45, lng: 5 }, 78_847],
    ["from the equator to the pole", { lat: 0, lng: 0 }, { lat: 90, lng: 0 }, 10_001_966],
  ])("measures %s within 0.5 %%", (_, a, b, metres) => {
    expect(Math.abs(distanceMetres(a, b) - metres) / metres).toBeLessThan(0.005);
  });

  it("is the same both ways, and zero from a position to itself", () => {
    expect(distanceMetres(FLAG, BRINDAS)).toBeCloseTo(distanceMetres(BRINDAS, FLAG), 6);
    expect(distanceMetres(FLAG, FLAG)).toBe(0);
  });

  it("measures the offsets these tests build", () => {
    expect(distanceMetres(BRINDAS, north(BRINDAS, 10))).toBeCloseTo(10, 6);
    expect(distanceMetres(BRINDAS, east(BRINDAS, 40))).toBeCloseTo(40, 6);
  });
});

describe("mapOf: a point per car with a position (CA1.3)", () => {
  it("gives each car with a position its own point, in the order of the cards", () => {
    const map = mapOf(FLAG, [car("a", BRINDAS), car("b", VAUGNERAY), car("c", ECULLY)]);

    expect(idsOf(map)).toEqual([["a"], ["b"], ["c"]]);
    expect(map.points.map((point) => point.position)).toEqual([BRINDAS, VAUGNERAY, ECULLY]);
  });

  it("gives no point to a car without a position", () => {
    const map = mapOf(FLAG, [car("a", null), car("b", VAUGNERAY), car("c", null)]);

    expect(idsOf(map)).toEqual([["b"]]);
  });

  it("keeps the flag and the cars as given", () => {
    const a = car("a", BRINDAS);
    const map = mapOf(FLAG, [a]);

    expect(map.flag).toEqual(FLAG);
    expect(map.points[0].cars[0]).toBe(a);
  });
});

describe("mapOf: cars less than 25 m apart make one point (CA1.6)", () => {
  it("groups at 25 m", () => {
    expect(SAME_POSITION_METRES).toBe(25);
  });

  it("makes one point of two cars 10 m apart", () => {
    expect(idsOf(mapOf(FLAG, [car("a", BRINDAS), car("b", north(BRINDAS, 10))]))).toEqual([["a", "b"]]);
  });

  it("makes one point of two cars 24 m apart, and two of two cars 26 m apart", () => {
    expect(idsOf(mapOf(FLAG, [car("a", BRINDAS), car("b", east(BRINDAS, 24))]))).toEqual([["a", "b"]]);
    expect(idsOf(mapOf(FLAG, [car("a", BRINDAS), car("b", east(BRINDAS, 26))]))).toEqual([["a"], ["b"]]);
  });

  it("makes two points of two cars exactly 25 m apart: less than 25 m, not 25 m", () => {
    // 25 m to the last bit of a double: `<=` instead of `<` would make one point of them.
    const a: Position = { lat: 0, lng: 0 };
    const b: Position = { lat: 0.0002248300909311345, lng: 0 };

    expect(distanceMetres(a, b)).toBe(SAME_POSITION_METRES);
    expect(idsOf(mapOf(FLAG, [car("a", a), car("b", b)]))).toEqual([["a"], ["b"]]);
    expect(mapOf(a, [car("b", b)]).points[0].atFlag).toBe(false);
  });

  it("makes two points of two cars 40 m apart", () => {
    expect(idsOf(mapOf(FLAG, [car("a", BRINDAS), car("b", east(BRINDAS, 40))]))).toEqual([["a"], ["b"]]);
  });

  it("makes one point of two cars at the same position, both in the order of the cards", () => {
    const map = mapOf(FLAG, [car("b", BRINDAS), car("a", { ...BRINDAS })]);

    expect(idsOf(map)).toEqual([["b", "a"]]);
  });

  it("measures from a point's first car: A, B and C 20 m apart make A and B, then C", () => {
    const cars = [car("a", BRINDAS), car("b", north(BRINDAS, 20)), car("c", north(BRINDAS, 40))];
    const map = mapOf(FLAG, cars);

    expect(idsOf(map)).toEqual([["a", "b"], ["c"]]);
    expect(map.points.map((point) => point.position)).toEqual([BRINDAS, north(BRINDAS, 40)]);
  });

  it("puts a car in the first point near enough, in the order of the cards, not the nearest", () => {
    const cars = [car("a", BRINDAS), car("b", north(BRINDAS, 30)), car("c", north(BRINDAS, 22))];

    expect(idsOf(mapOf(FLAG, cars))).toEqual([["a", "c"], ["b"]]);
  });

  it("keeps the points in the order of their first car, cars without a position in between", () => {
    const cars = [car("a", BRINDAS), car("x", null), car("b", ECULLY), car("c", north(BRINDAS, 5))];

    expect(idsOf(mapOf(FLAG, cars))).toEqual([["a", "c"], ["b"]]);
  });
});

describe("mapOf: a point at the event's place (CA1.15)", () => {
  it("puts a point 24 m from the flag at the flag", () => {
    expect(mapOf(FLAG, [car("a", north(FLAG, 24))]).points[0].atFlag).toBe(true);
  });

  it("puts a point at the very place of the flag at the flag", () => {
    expect(mapOf(FLAG, [car("a", FLAG)]).points[0].atFlag).toBe(true);
  });

  it("does not put a point 100 m or 26 m from the flag at the flag", () => {
    expect(mapOf(FLAG, [car("a", east(FLAG, 100))]).points[0].atFlag).toBe(false);
    expect(mapOf(FLAG, [car("a", east(FLAG, 26))]).points[0].atFlag).toBe(false);
  });

  it("makes one point at the flag of two cars less than 25 m from it, 40 m apart, in the order of the cards (v16)", () => {
    const map = mapOf(FLAG, [car("n", north(FLAG, 20)), car("s", north(FLAG, -20))]);

    expect(idsOf(map)).toEqual([["n", "s"]]);
    expect(map.points[0].atFlag).toBe(true);
    expect(map.points[0].position).toEqual(north(FLAG, 20));
  });

  it("puts the flag first: a car less than 25 m from the flag joins it, not an earlier point 10 m away", () => {
    // A, 30 m from the flag and first in the order of the cards; B, 20 m from the flag and 10 m from A.
    const map = mapOf(FLAG, [car("a", north(FLAG, 30)), car("b", north(FLAG, 20))]);

    expect(idsOf(map)).toEqual([["a"], ["b"]]);
    expect(map.points.map((point) => point.atFlag)).toEqual([false, true]);
  });

  it("never puts a car 25 m or more from the flag in the flag's point, even 10 m from its first car", () => {
    const map = mapOf(FLAG, [car("b", north(FLAG, 20)), car("a", north(FLAG, 30))]);

    expect(idsOf(map)).toEqual([["b"], ["a"]]);
    expect(map.points.map((point) => point.atFlag)).toEqual([true, false]);
  });

  it("groups the other cars with each other at 25 m, as before, whatever the flag's point holds", () => {
    const cars = [car("f", FLAG), car("a", east(FLAG, 30)), car("b", east(FLAG, 40)), car("c", north(FLAG, 5))];

    expect(idsOf(mapOf(FLAG, cars))).toEqual([["f", "c"], ["a", "b"]]);
  });
});

describe("mapOf: counting the cars on the map and the others (CA2.2, CA2.3)", () => {
  it("has no point and counts nothing in an empty leg", () => {
    expect(mapOf(FLAG, [])).toEqual({ flag: FLAG, points: [], onMap: 0, notOnMap: 0 });
  });

  it("counts the cars without a position apart", () => {
    const map = mapOf(FLAG, [car("a", null), car("b", BRINDAS), car("c", null)]);

    expect(map.onMap).toBe(1);
    expect(map.notOnMap).toBe(2);
  });

  it("counts the cars on the map, not the points", () => {
    const map = mapOf(FLAG, [car("a", BRINDAS), car("b", BRINDAS), car("c", ECULLY)]);

    expect(map.points).toHaveLength(2);
    expect(map.onMap).toBe(3);
    expect(map.notOnMap).toBe(0);
  });

  it("puts nothing on the map when no car has a position", () => {
    const map = mapOf(FLAG, [car("a", null), car("b", null)]);

    expect(map.points).toEqual([]);
    expect(map.onMap).toBe(0);
    expect(map.notOnMap).toBe(2);
  });
});

describe("framing", () => {
  /** One line of credits, 24 px high (CA3.7). */
  const ONE_LINE = 24;
  const away = (position: Position) => ({ position, atFlag: false });

  it("shows the flag alone at zoom 14 when there is no point", () => {
    expect(framing(FLAG, [], ONE_LINE)).toEqual({ kind: "flag", center: FLAG, zoom: 14 });
  });

  it("fits the flag and every point, 32 px around and the credits' height more at the bottom, zoom 15 at most", () => {
    // The flag is the farthest east; the points, the farthest south, north and west.
    const points = [away({ lat: 45.8, lng: 4.7 }), away({ lat: 45.7, lng: 4.8 })];

    expect(framing(FLAG, points, ONE_LINE)).toEqual({
      kind: "bounds",
      south: 45.7,
      west: 4.7,
      north: 45.8,
      east: FLAG.lng,
      padding: { top: 32, right: 32, bottom: 56, left: 32 },
      maxZoom: 15,
    });
  });

  it("keeps the credits' measured height clear at the bottom: two lines, 48 px, give 80 px (CA3.7)", () => {
    expect(framing(FLAG, [away(BRINDAS)], 48)).toMatchObject({ padding: { top: 32, right: 32, bottom: 80, left: 32 } });
  });

  it("gives the flag's point room under the flag: h + 64 at the bottom (v22)", () => {
    // Its button hangs from 16 px under the flag, 44 px high: down to 60 px under its place.
    const points = [away(ECULLY), { position: north(FLAG, 10), atFlag: true }];

    expect(framing(FLAG, points, ONE_LINE)).toMatchObject({ padding: { top: 32, right: 32, bottom: 88, left: 32 } });
    expect(framing(FLAG, points, 48)).toMatchObject({ padding: { bottom: 112 } });
  });

  it("takes the flag as the edge it is, on any side", () => {
    const points = [away({ lat: 45.8, lng: 4.9 })];

    expect(framing(FLAG, points, ONE_LINE)).toMatchObject({ south: FLAG.lat, west: FLAG.lng, north: 45.8, east: 4.9 });
  });

  it("takes the flag as the north edge when it is the farthest north", () => {
    const points = [away({ lat: 45.7, lng: 4.7 })];

    expect(framing(FLAG, points, ONE_LINE)).toMatchObject({ south: 45.7, west: 4.7, north: FLAG.lat, east: FLAG.lng });
  });

  it("frames the points mapOf gives", () => {
    const map = mapOf(FLAG, [car("a", BRINDAS), car("b", null), car("c", ECULLY)]);

    expect(framing(map.flag, map.points, ONE_LINE)).toMatchObject({
      south: BRINDAS.lat,
      west: BRINDAS.lng,
      north: ECULLY.lat,
      east: FLAG.lng,
      padding: { bottom: 56 },
    });
  });

  it("reads mapOf's flag point as the one under the flag", () => {
    const map = mapOf(FLAG, [car("a", BRINDAS), car("b", east(FLAG, 10))]);

    expect(framing(map.flag, map.points, ONE_LINE)).toMatchObject({ padding: { bottom: 88 } });
  });
});

describe("bubbleMaxHeight", () => {
  it("stops the bubble 10 px above the credits: the map's height, less twice its inset, less theirs (v22)", () => {
    expect(BUBBLE_INSET).toBe(10);
    expect(bubbleMaxHeight(240, 24)).toBe(196);
    expect(bubbleMaxHeight(280, 24)).toBe(236);
    expect(bubbleMaxHeight(240, 48)).toBe(172);
  });
});

describe("event-map.ts", () => {
  it("can be imported by the browser: no Node built-in", () => {
    const source = readFileSync(new URL("./event-map.ts", import.meta.url), "utf8");
    expect(browserUnsafe(source)).toEqual([]);
  });
});
