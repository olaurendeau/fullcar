import { describe, expect, it } from "vitest";
import { STOPS_MAX } from "@/domain/stop";
import { addStop, atMaximum, lineErrors, removeStop, removedWithPassengers, sortByTime, stopsToSend, type KnownStop, type StopLine } from "./stops-state";

// #889, epic #881: the lines of « Points de RDV » in the car's form (RV1.2 to RV1.7), as pure functions.

const AT = { lat: 45.72123, lng: 4.69876 };
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const line = (n: number, time: string, location = `Lieu ${n}`, position: StopLine["position"] = null): StopLine => ({ id: ID(n), location, position, time });

describe("addStop", () => {
  it("RV1.2: a blank line with the given id, last", () => {
    expect(addStop([line(1, "08:25")], ID(2))).toEqual([line(1, "08:25"), { id: ID(2), location: "", position: null, time: "" }]);
  });

  it("RV1.2: a seventh point is not added", () => {
    const six = Array.from({ length: STOPS_MAX }, (_, n) => line(n + 1, "08:25"));
    expect(atMaximum(six)).toBe(true);
    expect(addStop(six, ID(7))).toBe(six);
    expect(atMaximum(six.slice(1))).toBe(false);
  });
});

describe("removeStop", () => {
  const lines = [line(1, "08:25"), line(2, "08:35"), line(3, "08:50")];

  it("RV1.6: the line goes, the focus to the « Retirer » of the one before", () => {
    expect(removeStop(lines, ID(3))).toEqual({ lines: lines.slice(0, 2), focus: ID(2) });
    expect(removeStop(lines, ID(2))).toEqual({ lines: [lines[0], lines[2]], focus: ID(1) });
  });

  it("RV1.6: the first line has none before: the focus goes to « Ajouter »", () => {
    expect(removeStop(lines, ID(1))).toEqual({ lines: lines.slice(1), focus: null });
  });
});

describe("sortByTime", () => {
  it("RV1.5: by time, and says the order changed", () => {
    const sorted = sortByTime([line(1, "08:50"), line(2, "08:25"), line(3, "08:35")]);
    expect(sorted.lines.map(({ id }) => id)).toEqual([ID(2), ID(3), ID(1)]);
    expect(sorted.changed).toBe(true);
  });

  it("RV1.5: already in order, nothing changed, the same list", () => {
    const lines = [line(1, "08:25"), line(2, "08:35")];
    expect(sortByTime(lines)).toEqual({ lines, changed: false });
  });

  it("RV1.5: at the same time, the order of entry", () => {
    const sorted = sortByTime([line(1, "08:35"), line(2, "08:25"), line(3, "08:25")]);
    expect(sorted.lines.map(({ id }) => id)).toEqual([ID(2), ID(3), ID(1)]);
  });

  it("a line without a valid time stays where it is, the others are sorted around it", () => {
    const sorted = sortByTime([line(1, "08:50"), line(2, ""), line(3, "08:25")]);
    expect(sorted.lines.map(({ id }) => id)).toEqual([ID(3), ID(2), ID(1)]);
    expect(sorted.changed).toBe(true);
    expect(sortByTime([line(1, ""), line(2, "08:25")]).changed).toBe(false);
  });
});

describe("lineErrors", () => {
  it("RV1.4: no line, no error", () => {
    expect(lineErrors([], "08:00")).toBeUndefined();
    expect(lineErrors([line(1, "08:25")], "08:00")).toBeUndefined();
  });

  it("RV1.4: the place is required, 120 characters at most; the time is valid and after the departure", () => {
    const found = lineErrors([line(1, "08:25"), line(2, "", " "), line(3, "08:00", "x".repeat(121)), line(4, "07:50")], "08:00");
    expect(found).toEqual({
      errors: [{}, { location: "required", time: "badTime" }, { location: "tooLong", time: "notAfterDeparture" }, { time: "notAfterDeparture" }],
      first: 1,
    });
  });

  it("the departure is none while its own field is in error: only the lines are checked", () => {
    expect(lineErrors([line(1, "07:00")], "")).toBeUndefined();
  });
});

describe("stopsToSend", () => {
  const shown = [line(1, "08:25", "Prelles", AT), line(2, "08:35")];

  it("RV1.7: an offer without a point sends none", () => {
    expect(stopsToSend(undefined, [])).toBeUndefined();
  });

  it("an offer sends its lines, in the order shown", () => {
    expect(stopsToSend(undefined, shown)).toEqual(shown);
  });

  it("a change with nothing changed sends nothing, the position at 5 decimals being the same", () => {
    expect(stopsToSend(shown, [line(1, "08:25", "Prelles", { lat: 45.721234, lng: 4.698762 }), line(2, "08:35")])).toBeUndefined();
  });

  it("a change sends the list whole as soon as a line changed: its text, time, position, a line added or removed", () => {
    expect(stopsToSend(shown, [{ ...shown[0], location: "Prelles bis" }, shown[1]])).toHaveLength(2);
    expect(stopsToSend(shown, [{ ...shown[0], time: "08:26" }, shown[1]])).toHaveLength(2);
    expect(stopsToSend(shown, [{ ...shown[0], position: null }, shown[1]])).toHaveLength(2);
    expect(stopsToSend(shown, [...shown, line(3, "09:00")])).toHaveLength(3);
    expect(stopsToSend(shown, [shown[0]])).toEqual([shown[0]]);
  });

  it("every point removed from a car that had some sends the empty list", () => {
    expect(stopsToSend(shown, [])).toEqual([]);
  });

  it("only the order changed is a change", () => {
    expect(stopsToSend(shown, [shown[1], shown[0]])).toHaveLength(2);
  });
});

describe("removedWithPassengers", () => {
  const known = (n: number, passengers: number): KnownStop => ({ id: ID(n), location: `Lieu ${n}`, passengers });

  it("RV6.1: a point removed that people chose has its number of people, in the order of the car", () => {
    const cars = [known(1, 2), known(2, 1), known(3, 3)];
    expect(removedWithPassengers(cars, [line(2, "08:35")])).toEqual([known(1, 2), known(3, 3)]);
    expect(removedWithPassengers(cars, [])).toEqual(cars);
  });

  it("RV6.1: a point removed that nobody chose has no note", () => {
    expect(removedWithPassengers([known(1, 0), known(2, 0)], [])).toEqual([]);
  });

  it("RV6.2: a point kept or changed, its place or its time, has no note", () => {
    const cars = [known(1, 2), known(2, 1)];
    expect(removedWithPassengers(cars, [line(1, "08:25"), line(2, "08:35")])).toEqual([]);
    expect(removedWithPassengers(cars, [line(1, "09:00", "Autre lieu", AT), line(2, "08:35")])).toEqual([]);
  });

  it("a point added is not a removed one, even if it takes the place of one", () => {
    expect(removedWithPassengers([known(1, 2)], [line(2, "08:25")])).toEqual([known(1, 2)]);
  });
});
