import { describe, expect, it } from "vitest";
import { mapOf, type EventMapPoints } from "@/domain/event-map";
import type { Position } from "@/domain/place";
import { mapUpdate, pointKey, type MapFocus, type MapView } from "./event-map-state";

/** The event's place: the flag. */
const FLAG: Position = { lat: 45.764, lng: 4.8357 };
/** Each about 10 km from the flag, and from each other. */
const BRINDAS: Position = { lat: 45.7196, lng: 4.6975 };
const VAUGNERAY: Position = { lat: 45.7378, lng: 4.6564 };
const ECULLY: Position = { lat: 45.7744, lng: 4.7775 };

/** The metres of a degree of latitude, on the sphere of `distanceMetres`. */
const METRES_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;

/** `metres` to the north of `from`. */
function north(from: Position, metres: number): Position {
  return { lat: from.lat + metres / METRES_PER_DEGREE, lng: from.lng };
}

interface Car {
  id: string;
  position: Position | null;
  free: number;
}

function car(id: string, position: Position | null, free = 2): Car {
  return { id, position, free };
}

function map(cars: Car[], flag: Position = FLAG): EventMapPoints<Car> {
  return mapOf(flag, cars);
}

/** Nothing of the map has the focus, no bubble is open, nobody touched the map. */
const UNTOUCHED: MapView = { focus: null, bubble: null, touched: false };

function focused(focus: MapFocus, view: Partial<MapView> = {}): MapView {
  return { ...UNTOUCHED, focus, ...view };
}

/** The update's points, as `[key, change]`, in the order they get. */
function changes(update: ReturnType<typeof mapUpdate<Car>>): [string, string][] {
  return update.points.map(({ key, change }) => [key, change]);
}

describe("pointKey", () => {
  it("is the ids of the point's cars, in the order of the cards", () => {
    const { points } = map([car("nina", BRINDAS), car("paul", BRINDAS), car("lea", ECULLY)]);
    expect(points.map(pointKey)).toEqual(["nina paul", "lea"]);
  });
});

describe("a car, or its position, added", () => {
  const before = map([car("nina", BRINDAS), car("lea", ECULLY)]);
  const added = map([car("nina", BRINDAS), car("paul", VAUGNERAY), car("lea", ECULLY)]);
  const positioned = map([car("nina", BRINDAS), car("paul", null), car("lea", ECULLY)]);

  it("is one more point, at its place in the order of the cards; the others are kept", () => {
    const update = mapUpdate(before, added, UNTOUCHED);
    expect(changes(update)).toEqual([
      ["nina", "kept"],
      ["paul", "created"],
      ["lea", "kept"],
    ]);
    expect(update.points.map(({ point }) => point)).toEqual(added.points);
    expect(update.removed).toEqual([]);
  });

  it("is the same for a position added to a car already there", () => {
    const update = mapUpdate(positioned, added, UNTOUCHED);
    expect(changes(update)).toEqual([
      ["nina", "kept"],
      ["paul", "created"],
      ["lea", "kept"],
    ]);
  });

  it("reframes only while nobody has touched the map", () => {
    expect(mapUpdate(before, added, UNTOUCHED).reframe).toBe(true);
    expect(mapUpdate(positioned, added, UNTOUCHED).reframe).toBe(true);
    expect(mapUpdate(before, added, { ...UNTOUCHED, touched: true }).reframe).toBe(false);
  });

  it("reframes for a car that joins a point too: it arrives on the map", () => {
    const joined = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10)), car("lea", ECULLY)]);
    expect(mapUpdate(before, joined, UNTOUCHED).reframe).toBe(true);
  });

  it("leaves the focus where it is", () => {
    expect(mapUpdate(before, added, focused({ kind: "point", key: "lea" })).focus).toEqual({ kind: "point", key: "lea" });
    expect(mapUpdate(before, added, focused({ kind: "container" })).focus).toEqual({ kind: "container" });
    expect(mapUpdate(before, added, UNTOUCHED).focus).toBeNull();
  });

  it("puts the points back in the order of the cards: a created point is added last", () => {
    expect(mapUpdate(before, added, UNTOUCHED).reorder).toBe(true);
    const last = map([car("nina", BRINDAS), car("lea", ECULLY), car("paul", VAUGNERAY)]);
    expect(mapUpdate(before, last, UNTOUCHED).reorder).toBe(false);
  });
});

describe("a car, or its position, removed", () => {
  const before = map([car("nina", BRINDAS), car("paul", VAUGNERAY), car("lea", ECULLY)]);
  const removed = map([car("nina", BRINDAS), car("lea", ECULLY)]);
  const unpositioned = map([car("nina", BRINDAS), car("paul", null), car("lea", ECULLY)]);

  it("takes its point away; the others are kept, in their order", () => {
    for (const after of [removed, unpositioned]) {
      const update = mapUpdate(before, after, UNTOUCHED);
      expect(changes(update)).toEqual([
        ["nina", "kept"],
        ["lea", "kept"],
      ]);
      expect(update.removed).toEqual(["paul"]);
      expect(update.reorder).toBe(false);
    }
  });

  it("does not reframe", () => {
    expect(mapUpdate(before, removed, UNTOUCHED).reframe).toBe(false);
  });

  it("sends the focus its point had to the map's container", () => {
    for (const after of [removed, unpositioned]) {
      expect(mapUpdate(before, after, focused({ kind: "point", key: "paul" })).focus).toEqual({ kind: "container" });
    }
  });

  it("leaves the focus another point had where it is", () => {
    expect(mapUpdate(before, removed, focused({ kind: "point", key: "lea" })).focus).toEqual({ kind: "point", key: "lea" });
  });
});

describe("the position of a car changes", () => {
  const before = map([car("nina", BRINDAS), car("paul", VAUGNERAY)]);
  const after = map([car("nina", BRINDAS), car("paul", north(VAUGNERAY, 500))]);

  it("moves the same point", () => {
    const update = mapUpdate(before, after, UNTOUCHED);
    expect(changes(update)).toEqual([
      ["nina", "kept"],
      ["paul", "moved"],
    ]);
    expect(update.points[1].point.position).toEqual(north(VAUGNERAY, 500));
    expect(update.removed).toEqual([]);
    expect(update.reorder).toBe(false);
  });

  it("does not reframe", () => {
    expect(mapUpdate(before, after, UNTOUCHED).reframe).toBe(false);
  });

  it("leaves the focus on the point", () => {
    expect(mapUpdate(before, after, focused({ kind: "point", key: "paul" })).focus).toEqual({ kind: "point", key: "paul" });
  });

  it("moves a group with its first car, and keeps it whole", () => {
    const group = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10))]);
    const moved = map([car("nina", north(BRINDAS, 5)), car("paul", north(BRINDAS, 10))]);
    expect(changes(mapUpdate(group, moved, UNTOUCHED))).toEqual([["nina paul", "moved"]]);
  });
});

describe("grouping, or splitting", () => {
  const apart = map([car("nina", BRINDAS), car("paul", VAUGNERAY), car("lea", ECULLY)]);
  const grouped = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10)), car("lea", ECULLY)]);

  it("recreates the points whose cars change", () => {
    const update = mapUpdate(apart, grouped, UNTOUCHED);
    expect(changes(update)).toEqual([
      ["nina paul", "created"],
      ["lea", "kept"],
    ]);
    expect(update.removed).toEqual(["nina", "paul"]);
    expect(update.reorder).toBe(true);

    const split = mapUpdate(grouped, apart, UNTOUCHED);
    expect(changes(split)).toEqual([
      ["nina", "created"],
      ["paul", "created"],
      ["lea", "kept"],
    ]);
    expect(split.removed).toEqual(["nina paul"]);
  });

  it("does not reframe: no car arrives on the map", () => {
    expect(mapUpdate(apart, grouped, UNTOUCHED).reframe).toBe(false);
    expect(mapUpdate(grouped, apart, UNTOUCHED).reframe).toBe(false);
  });

  it("sends the focus to the point that now holds the car", () => {
    expect(mapUpdate(apart, grouped, focused({ kind: "point", key: "paul" })).focus).toEqual({ kind: "point", key: "nina paul" });
    expect(mapUpdate(apart, grouped, focused({ kind: "point", key: "nina" })).focus).toEqual({ kind: "point", key: "nina paul" });
  });

  it("sends the focus a group had to the point of its first car still on the map", () => {
    expect(mapUpdate(grouped, apart, focused({ kind: "point", key: "nina paul" })).focus).toEqual({ kind: "point", key: "nina" });
    const ninaGone = map([car("paul", VAUGNERAY), car("lea", ECULLY)]);
    expect(mapUpdate(grouped, ninaGone, focused({ kind: "point", key: "nina paul" })).focus).toEqual({ kind: "point", key: "paul" });
  });

  it("recreates a group that loses a car, and sends its focus to what is left", () => {
    const left = map([car("nina", BRINDAS), car("lea", ECULLY)]);
    const update = mapUpdate(grouped, left, focused({ kind: "point", key: "nina paul" }));
    expect(changes(update)).toEqual([
      ["nina", "created"],
      ["lea", "kept"],
    ]);
    expect(update.focus).toEqual({ kind: "point", key: "nina" });
  });
});

describe("an open bubble whose list changes", () => {
  const pair = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10)), car("lea", ECULLY)]);
  const bubble = "nina paul";
  const left = map([car("nina", BRINDAS), car("lea", ECULLY)]);
  const third = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10)), car("lea", north(BRINDAS, 5))]);
  const gone = map([car("lea", ECULLY)]);

  it("closes", () => {
    for (const after of [left, third, gone]) {
      expect(mapUpdate(pair, after, focused({ kind: "close" }, { bubble })).closeBubble).toBe(true);
    }
  });

  it("sends the focus it had to the point at its position", () => {
    expect(mapUpdate(pair, left, focused({ kind: "close" }, { bubble })).focus).toEqual({ kind: "point", key: "nina" });
    expect(mapUpdate(pair, third, focused({ kind: "bubble", car: "paul" }, { bubble })).focus).toEqual({
      kind: "point",
      key: "nina paul lea",
    });
  });

  it("finds that point less than 25 m away, not further", () => {
    const near = map([car("paul", north(BRINDAS, 20)), car("lea", ECULLY)]);
    expect(mapUpdate(pair, near, focused({ kind: "close" }, { bubble })).focus).toEqual({ kind: "point", key: "paul" });
    const far = map([car("paul", north(BRINDAS, 30)), car("lea", ECULLY)]);
    expect(mapUpdate(pair, far, focused({ kind: "close" }, { bubble })).focus).toEqual({ kind: "container" });
  });

  it("sends it to the map's container when no point is left there", () => {
    expect(mapUpdate(pair, gone, focused({ kind: "bubble", car: "nina" }, { bubble })).focus).toEqual({ kind: "container" });
  });

  it("stays open, the focus with it, while its list does not change", () => {
    const moved = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10), 0), car("lea", VAUGNERAY)]);
    const update = mapUpdate(pair, moved, focused({ kind: "bubble", car: "paul" }, { bubble }));
    expect(update.closeBubble).toBe(false);
    expect(update.focus).toEqual({ kind: "bubble", car: "paul" });
    expect(mapUpdate(pair, moved, focused({ kind: "close" }, { bubble })).focus).toEqual({ kind: "close" });
  });

  it("closes without moving a focus that was elsewhere", () => {
    const update = mapUpdate(pair, left, { ...UNTOUCHED, bubble });
    expect(update.closeBubble).toBe(true);
    expect(update.focus).toBeNull();
  });

  it("has nothing to close when no bubble is open", () => {
    expect(mapUpdate(pair, left, UNTOUCHED).closeBubble).toBe(false);
  });
});

describe("free seats change", () => {
  const before = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10)), car("lea", ECULLY)]);
  const after = map([car("nina", BRINDAS, 0), car("paul", north(BRINDAS, 10), 1), car("lea", ECULLY, 3)]);

  it("keeps every point, with its cars as they are now", () => {
    const update = mapUpdate(before, after, UNTOUCHED);
    expect(changes(update)).toEqual([
      ["nina paul", "kept"],
      ["lea", "kept"],
    ]);
    expect(update.points[0].point.cars.map(({ free }) => free)).toEqual([0, 1]);
    expect(update.removed).toEqual([]);
    expect(update.reorder).toBe(false);
    expect(update.reframe).toBe(false);
  });

  it("leaves the focus where it is", () => {
    expect(mapUpdate(before, after, focused({ kind: "point", key: "nina paul" })).focus).toEqual({ kind: "point", key: "nina paul" });
  });
});

describe("the position of the event changes", () => {
  const cars = [car("nina", BRINDAS), car("lea", ECULLY)];
  const before = map(cars);
  const after = map(cars, north(FLAG, 300));

  it("keeps the points, and reframes only while nobody has touched the map", () => {
    const update = mapUpdate(before, after, UNTOUCHED);
    expect(changes(update)).toEqual([
      ["nina", "kept"],
      ["lea", "kept"],
    ]);
    expect(update.reframe).toBe(true);
    expect(mapUpdate(before, after, { ...UNTOUCHED, touched: true }).reframe).toBe(false);
  });

  it("reframes for a change of longitude alone", () => {
    expect(mapUpdate(before, map(cars, { lat: FLAG.lat, lng: FLAG.lng + 0.01 }), UNTOUCHED).reframe).toBe(true);
  });

  it("does not reframe when nothing moves", () => {
    expect(mapUpdate(before, map(cars), UNTOUCHED).reframe).toBe(false);
  });

  it("leaves the focus where it is", () => {
    expect(mapUpdate(before, after, focused({ kind: "point", key: "lea" })).focus).toEqual({ kind: "point", key: "lea" });
    expect(mapUpdate(before, after, focused({ kind: "container" })).focus).toEqual({ kind: "container" });
  });
});

describe("never <body>: the map's container, failing all else", () => {
  const before = map([car("nina", BRINDAS)]);
  const empty = map([]);

  it("takes the focus of a point no longer on the map", () => {
    expect(mapUpdate(before, empty, focused({ kind: "point", key: "nina" })).focus).toEqual({ kind: "container" });
  });

  it("takes the focus of a point it does not know", () => {
    expect(mapUpdate(before, before, focused({ kind: "point", key: "paul" })).focus).toEqual({ kind: "container" });
  });

  it("takes the focus of a bubble it does not know", () => {
    expect(mapUpdate(before, before, focused({ kind: "close" })).focus).toEqual({ kind: "container" });
    expect(mapUpdate(before, before, focused({ kind: "bubble", car: "nina" }, { bubble: "paul" })).focus).toEqual({
      kind: "container",
    });
  });
});
