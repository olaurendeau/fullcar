import { describe, expect, it } from "vitest";
import { distanceMetres, mapOf, SAME_POSITION_METRES, type EventMapPoints } from "@/domain/event-map";
import type { Position } from "@/domain/place";
import {
  LEAFLET_IDLE,
  leafletFocus,
  leafletStep,
  mapUpdate,
  pointKey,
  TILES_QUIET,
  tilesStep,
  type LeafletEvent,
  type LeafletState,
  type MapFocus,
  type MapView,
  type TilesView,
} from "./event-map-state";

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
  it("is the ids of the point's cars, whatever the order of their cards", () => {
    const { points } = map([car("nina", BRINDAS), car("paul", BRINDAS), car("lea", ECULLY)]);
    expect(points.map(pointKey)).toEqual(["nina paul", "lea"]);
    expect(map([car("paul", BRINDAS), car("nina", BRINDAS)]).points.map(pointKey)).toEqual(["nina paul"]);
  });
});

describe("the cards change order", () => {
  it("keeps the points, and puts them back in the order of the cards", () => {
    const before = map([car("nina", BRINDAS), car("lea", ECULLY)]);
    const update = mapUpdate(before, map([car("lea", ECULLY), car("nina", BRINDAS)]), focused({ kind: "point", key: "nina" }));
    expect(changes(update)).toEqual([
      ["lea", "kept"],
      ["nina", "kept"],
    ]);
    expect(update.reorder).toBe(true);
    expect(update.removed).toEqual([]);
    expect(update.focus).toEqual({ kind: "point", key: "nina" });
  });

  it("keeps a group whose cars swap, open bubble and focus with it; it moves with its new first car", () => {
    const before = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10))]);
    const after = map([car("paul", north(BRINDAS, 10)), car("nina", BRINDAS)]);
    const update = mapUpdate(before, after, focused({ kind: "bubble", car: "paul" }, { bubble: "nina paul" }));
    expect(changes(update)).toEqual([["nina paul", "moved"]]);
    expect(update.points[0].point.cars.map(({ id }) => id)).toEqual(["paul", "nina"]);
    expect(update.closeBubble).toBe(false);
    expect(update.focus).toEqual({ kind: "bubble", car: "paul" });
    expect(update.reorder).toBe(false);
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

  it("sends the focus a group had to the point of the car that left it", () => {
    expect(mapUpdate(grouped, apart, focused({ kind: "point", key: "nina paul" })).focus).toEqual({ kind: "point", key: "paul" });
    const ninaLeft = map([car("nina", VAUGNERAY), car("paul", north(BRINDAS, 10)), car("lea", ECULLY)]);
    expect(mapUpdate(grouped, ninaLeft, focused({ kind: "point", key: "nina paul" })).focus).toEqual({ kind: "point", key: "nina" });
    const ninaGone = map([car("paul", VAUGNERAY), car("lea", ECULLY)]);
    expect(mapUpdate(grouped, ninaGone, focused({ kind: "point", key: "nina paul" })).focus).toEqual({ kind: "point", key: "paul" });
  });

  it("follows the middle car of three that leaves", () => {
    const three = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10)), car("lea", north(BRINDAS, 5))]);
    const paulLeft = map([car("nina", BRINDAS), car("paul", VAUGNERAY), car("lea", north(BRINDAS, 5))]);
    expect(mapUpdate(three, paulLeft, focused({ kind: "point", key: "lea nina paul" })).focus).toEqual({ kind: "point", key: "paul" });
  });

  it("follows the first of two cars that leave, in the order of the cards", () => {
    const three = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10)), car("lea", north(BRINDAS, 5))]);
    const twoLeft = map([car("nina", BRINDAS), car("paul", VAUGNERAY), car("lea", ECULLY)]);
    expect(mapUpdate(three, twoLeft, focused({ kind: "point", key: "lea nina paul" })).focus).toEqual({ kind: "point", key: "paul" });
  });

  it("sends the focus of a group split by a car removed, none moving, to its first car still on the map", () => {
    const three = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 20)), car("lea", north(BRINDAS, -20))]);
    const ninaGone = map([car("paul", north(BRINDAS, 20)), car("lea", north(BRINDAS, -20))]);
    const update = mapUpdate(three, ninaGone, focused({ kind: "point", key: "lea nina paul" }));
    expect(changes(update)).toEqual([
      ["paul", "created"],
      ["lea", "created"],
    ]);
    expect(update.focus).toEqual({ kind: "point", key: "paul" });
  });

  it("sends the focus a group had to its first car still on the map when none of its cars moved", () => {
    const joined = map([car("nina", BRINDAS), car("paul", north(BRINDAS, 10)), car("lea", north(BRINDAS, 5))]);
    expect(mapUpdate(grouped, joined, focused({ kind: "point", key: "nina paul" })).focus).toEqual({
      kind: "point",
      key: "lea nina paul",
    });
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
      key: "lea nina paul",
    });
  });

  it("finds that point less than 25 m away, not further", () => {
    const near = map([car("paul", north(BRINDAS, 20)), car("lea", ECULLY)]);
    expect(mapUpdate(pair, near, focused({ kind: "close" }, { bubble })).focus).toEqual({ kind: "point", key: "paul" });
    const far = map([car("paul", north(BRINDAS, 30)), car("lea", ECULLY)]);
    expect(mapUpdate(pair, far, focused({ kind: "close" }, { bubble })).focus).toEqual({ kind: "container" });
  });

  it("does not find a point exactly 25 m away", () => {
    const origin: Position = { lat: 0, lng: 0 };
    const at25: Position = { lat: 0.0002248300909311345, lng: 0 };
    expect(distanceMetres(origin, at25)).toBe(SAME_POSITION_METRES);
    const together = map([car("nina", origin), car("paul", origin)]);
    const ninaGone = map([car("paul", at25)]);
    expect(mapUpdate(together, ninaGone, focused({ kind: "close" }, { bubble })).focus).toEqual({ kind: "container" });
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

describe("only the free seats change: a seat taken or freed (#655, CA1.7)", () => {
  const before = map([car("sophie", north(FLAG, 10), 2), car("nina", BRINDAS, 1), car("paul", north(BRINDAS, 10), 2), car("lea", ECULLY, 1)]);
  const after = map([car("sophie", north(FLAG, 10), 1), car("nina", BRINDAS, 0), car("paul", north(BRINDAS, 10), 2), car("lea", ECULLY, 0)]);

  it("gives every point, the flag's too, the same element, and never reframes, even untouched", () => {
    const update = mapUpdate(before, after, UNTOUCHED);
    expect(changes(update)).toEqual([
      ["sophie", "kept"],
      ["nina paul", "kept"],
      ["lea", "kept"],
    ]);
    expect(update.points.map(({ point }) => point.cars.map(({ free }) => free))).toEqual([[1], [0, 2], [0]]);
    expect(update.removed).toEqual([]);
    expect(update.reorder).toBe(false);
    expect(update.reframe).toBe(false);
  });

  it("keeps the open bubble open, the focus on its car's button or its « Fermer »", () => {
    for (const focus of [{ kind: "bubble", car: "nina" }, { kind: "close" }] as const) {
      const update = mapUpdate(before, after, focused(focus, { bubble: "nina paul" }));
      expect(update.closeBubble).toBe(false);
      expect(update.focus).toEqual(focus);
    }
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

describe("the event moves, and the cars of the flag's point change (v16, « regroupement ou séparation »)", () => {
  // 20 m north and 20 m south of the flag, 40 m apart: one point at the flag.
  const nina = car("nina", north(FLAG, 20));
  const paul = car("paul", north(FLAG, -20));
  const before = map([nina, paul]);
  // 40 m north: Nina 20 m from it, Paul 60 m.
  const after = map([nina, paul], north(FLAG, 40));

  it("splits the flag's point: Paul leaves it, Nina stays at the flag", () => {
    expect(before.points.map(pointKey)).toEqual(["nina paul"]);
    const update = mapUpdate(before, after, UNTOUCHED);
    expect(changes(update)).toEqual([
      ["nina", "created"],
      ["paul", "created"],
    ]);
    expect(update.points.map(({ point }) => point.atFlag)).toEqual([true, false]);
    expect(update.removed).toEqual(["nina paul"]);
  });

  it("sends the focus the flag's point had to the point that now holds its first car", () => {
    expect(mapUpdate(before, after, focused({ kind: "point", key: "nina paul" })).focus).toEqual({ kind: "point", key: "nina" });
  });

  it("closes its open bubble, the focus to the point at its position", () => {
    const update = mapUpdate(before, after, focused({ kind: "bubble", car: "paul" }, { bubble: "nina paul" }));
    expect(update.closeBubble).toBe(true);
    expect(update.focus).toEqual({ kind: "point", key: "nina" });
  });

  it("groups a car the moved flag reaches, the focus its point had with it", () => {
    const lea = car("lea", north(FLAG, 60));
    const update = mapUpdate(map([nina, lea]), map([nina, lea], north(FLAG, 40)), focused({ kind: "point", key: "lea" }));
    expect(changes(update)).toEqual([["lea nina", "created"]]);
    expect(update.points[0].point.atFlag).toBe(true);
    expect(update.focus).toEqual({ kind: "point", key: "lea nina" });
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

describe("Leaflet's import (CA2.8, CA2.10)", () => {
  const loading = (failures = 0): LeafletState => ({ phase: "loading", failures, again: false });
  /** `state` after `event`, online unless said otherwise. */
  const step = (state: LeafletState, event: LeafletEvent, online = true) => leafletStep(state, event, online);
  /** Where the focus goes from `before` after `event`. */
  const focus = (before: LeafletState, event: LeafletEvent, focusInBox: boolean, online = true) =>
    leafletFocus(before, event, step(before, event, online), focusInBox);

  it("nothing asked for until a map opens; opened, loading", () => {
    expect(LEAFLET_IDLE).toEqual({ phase: "idle", failures: 0, again: false });
    expect(step(LEAFLET_IDLE, "open")).toEqual(loading());
    expect(focus(LEAFLET_IDLE, "open", true)).toBeNull();
  });

  it("failed at the first opening: the notice, the focus where it was", () => {
    expect(step(loading(), "failed")).toEqual({ phase: "failed", failures: 1, again: false });
    expect(focus(loading(), "failed", false)).toBeNull();
  });

  it("loaded at the first opening: the map, the focus where it was", () => {
    expect(step(loading(), "loaded")).toEqual({ phase: "ready", failures: 0, again: false });
    expect(focus(loading(), "loaded", false)).toBeNull();
  });

  it("« Réessayer »: loading again, the failures kept, the focus to the box", () => {
    const failed: LeafletState = { phase: "failed", failures: 1, again: false };
    expect(step(failed, "retry")).toEqual(loading(1));
    expect(focus(failed, "retry", false)).toBe("box");
    expect(focus(failed, "retry", true)).toBe("box");
  });

  it("loaded while the box has the focus: to « Carte », and no failure left", () => {
    expect(step(loading(2), "loaded")).toEqual({ phase: "ready", failures: 0, again: false });
    expect(focus(loading(2), "loaded", true)).toBe("toggle");
  });

  it("failed the first time while the box has the focus: to its « Réessayer »", () => {
    expect(focus(loading(), "failed", true)).toBe("retry");
  });

  it("failed a second time in a row, online: « toujours », the focus to « Recharger la page »", () => {
    expect(step(loading(1), "failed")).toEqual({ phase: "failed", failures: 2, again: true });
    expect(focus(loading(1), "failed", true)).toBe("reload");
    expect(focus(loading(1), "failed", false)).toBeNull();
  });

  it("failed a third time, online: « toujours » still, the focus to « Recharger la page »", () => {
    expect(step(loading(2), "failed")).toEqual({ phase: "failed", failures: 3, again: true });
    expect(focus(loading(2), "failed", true)).toBe("reload");
  });

  it("failed again offline: the first notice, the focus to its « Réessayer »", () => {
    expect(step(loading(1), "failed", false)).toEqual({ phase: "failed", failures: 2, again: false });
    expect(focus(loading(1), "failed", true, false)).toBe("retry");
    // Online again at the next failure: still in a row.
    expect(step(loading(2), "failed")).toEqual({ phase: "failed", failures: 3, again: true });
  });

  it("an event that nothing waits for changes nothing, and moves no focus", () => {
    const ready: LeafletState = { phase: "ready", failures: 0, again: false };
    const failed: LeafletState = { phase: "failed", failures: 2, again: true };
    for (const state of [LEAFLET_IDLE, ready, failed]) {
      for (const event of ["loaded", "failed"] as const) {
        expect(step(state, event)).toBe(state);
        expect(focus(state, event, true)).toBeNull();
      }
    }
    for (const state of [loading(1), ready, failed]) expect(step(state, "open")).toBe(state);
    for (const state of [LEAFLET_IDLE, loading(1), ready]) {
      expect(step(state, "retry")).toBe(state);
      expect(focus(state, "retry", true)).toBeNull();
    }
  });
});

describe("the tiles' notice (CA2.4)", () => {
  /** The view after `events`, from `from`, nothing of the notice focused. */
  function after(events: Parameters<typeof tilesStep>[1][], from: TilesView = TILES_QUIET): TilesView {
    return events.reduce((view, event) => tilesStep(view, event, false).view, from);
  }

  it("shows when a view ends loading with a tile in error, not before", () => {
    expect(after(["loading", "tileerror"]).notice).toBe(false);
    expect(after(["loading", "tileerror", "load"]).notice).toBe(true);
  });

  it("stays away when a view ends loading without an error", () => {
    expect(after(["loading", "load"]).notice).toBe(false);
  });

  it("stays while the next view loads, and goes when it ends without an error", () => {
    const shown = after(["loading", "tileerror", "load"]);
    expect(after(["loading"], shown).notice).toBe(true);
    expect(after(["loading", "load"], shown).notice).toBe(false);
  });

  it("stays when the next view ends with an error too", () => {
    const shown = after(["loading", "tileerror", "load"]);
    expect(after(["loading", "tileerror", "load"], shown).notice).toBe(true);
  });

  it("« Réessayer » forgets the errors of the tiles it asks for again, even while a view loads", () => {
    const shown = after(["loading", "tileerror", "load", "loading", "tileerror"]);
    expect(after(["retry", "load"], shown).notice).toBe(false);
    expect(after(["retry"], shown).notice).toBe(true);
  });

  it("gone while « Réessayer » has the focus: to the map's container", () => {
    const shown = after(["loading", "tileerror", "load", "loading"]);
    expect(tilesStep(shown, "load", true).focus).toBe("container");
    expect(tilesStep(shown, "load", false).focus).toBeNull();
  });

  it("staying, or not shown: the focus where it is", () => {
    const shown = after(["loading", "tileerror", "load", "loading", "tileerror"]);
    expect(tilesStep(shown, "load", true)).toEqual({ view: { failing: true, notice: true }, focus: null });
    for (const event of ["loading", "tileerror", "retry"] as const) expect(tilesStep(shown, event, true).focus).toBeNull();
    expect(tilesStep(after(["loading"]), "load", true).focus).toBeNull();
  });
});
