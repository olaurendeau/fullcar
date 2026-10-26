import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BoardPerson, BoardRows, PlacementRow, RideRow } from "./board";
import type { Leg } from "./leg";
import { legIsEmpty, organiserPanel, organiserPersons, type OrganiserLeg } from "./organiser-panel";
import type { OrganiserCar, OrganiserLegBoard } from "./phone-visibility";
import { browserUnsafe } from "./test-browser-safe";
import type { WallTime } from "./wall-clock";

function person(id: string): BoardPerson {
  return { id, firstName: id.toUpperCase() };
}

function car(
  id: string,
  { seats = 3, passengers = [] as string[], driverHasPhone = true, departureTime = "07:30:00" as WallTime } = {},
): OrganiserCar {
  const freeSeats = Math.max(0, seats - passengers.length);
  return {
    id,
    leg: "aller",
    driver: person(`${id}-driver`),
    location: `Parking ${id}`,
    departureTime,
    note: "Siège enfant",
    position: null,
    seats,
    passengers: passengers.map(person),
    freeSeats,
    full: freeSeats === 0,
    driverHasPhone,
  };
}

function legOf(cars: OrganiserCar[], withoutCar: [string, string | null][] = [], leg: Leg = "aller"): OrganiserLegBoard {
  return { leg, cars, withoutCar: withoutCar.map(([id, phone]) => ({ ...person(id), phone })) };
}

describe("organiserPanel", () => {
  it.each<[string, OrganiserLegBoard, OrganiserLeg]>([
    [
      "an empty leg",
      legOf([]),
      { leg: "aller", coverage: { withoutCar: 0, freeSeats: 0 }, carCount: 0, withoutCar: [], carsWithoutPhone: [] },
    ],
    [
      "persons without a car, and no car",
      legOf([], [["c", "06 33 33 33 33"], ["d", null]]),
      {
        leg: "aller",
        coverage: { withoutCar: 2, freeSeats: 0 },
        carCount: 0,
        withoutCar: [
          { id: "c", firstName: "C", phone: "06 33 33 33 33" },
          { id: "d", firstName: "D", phone: null },
        ],
        carsWithoutPhone: [],
      },
    ],
    [
      "a full car whose driver has a number: counted, and not listed (O3.4)",
      legOf([car("r1", { seats: 2, passengers: ["b", "e"] })]),
      { leg: "aller", coverage: { withoutCar: 0, freeSeats: 0 }, carCount: 1, withoutCar: [], carsWithoutPhone: [] },
    ],
    [
      "a driver without a number: the car is listed with its seats taken and free (O3.1)",
      legOf([car("r1", { seats: 4, passengers: ["b"], driverHasPhone: false })], [["c", "06 33 33 33 33"]]),
      {
        leg: "aller",
        coverage: { withoutCar: 1, freeSeats: 3 },
        carCount: 1,
        withoutCar: [{ id: "c", firstName: "C", phone: "06 33 33 33 33" }],
        carsWithoutPhone: [
          {
            id: "r1",
            driverFirstName: "R1-DRIVER",
            departureTime: "07:30:00",
            location: "Parking r1",
            taken: 1,
            free: 3,
          },
        ],
      },
    ],
    [
      "several cars: those without a number, in the board's order of departure",
      legOf(
        [
          car("r1", { departureTime: "07:00:00", driverHasPhone: false, seats: 1, passengers: ["b"] }),
          car("r2", { departureTime: "07:30:00" }),
          car("r3", { departureTime: "08:00:00", driverHasPhone: false, seats: 2 }),
        ],
        [],
        "retour",
      ),
      {
        leg: "retour",
        coverage: { withoutCar: 0, freeSeats: 5 },
        carCount: 3,
        withoutCar: [],
        carsWithoutPhone: [
          {
            id: "r1",
            driverFirstName: "R1-DRIVER",
            departureTime: "07:00:00",
            location: "Parking r1",
            taken: 1,
            free: 0,
          },
          {
            id: "r3",
            driverFirstName: "R3-DRIVER",
            departureTime: "08:00:00",
            location: "Parking r3",
            taken: 0,
            free: 2,
          },
        ],
      },
    ],
  ])("%s", (_, leg, expected) => {
    // toStrictEqual: no other field of a car (its note, its passengers) reaches the answer.
    expect(organiserPanel([leg])).toStrictEqual([expected]);
  });

  it("keeps the legs in the order given", () => {
    const legs = organiserPanel([legOf([], [], "aller"), legOf([], [], "retour")]);
    expect(legs.map((leg) => leg.leg)).toEqual(["aller", "retour"]);
  });

  it("copies a person without a car field by field: nothing else rides along", () => {
    const sneaky = { ...person("c"), phone: "06 33 33 33 33", state: { kind: "withoutCar" } };
    const [leg] = organiserPanel([{ leg: "aller", cars: [], withoutCar: [sneaky] }]);
    expect(leg.withoutCar).toStrictEqual([{ id: "c", firstName: "C", phone: "06 33 33 33 33" }]);
  });

  it("can be imported by the browser: no Node built-in", () => {
    const source = readFileSync(new URL("./organiser-panel.ts", import.meta.url), "utf8");
    expect(browserUnsafe(source)).toEqual([]);
  });
});

describe("legIsEmpty (O1.5)", () => {
  it.each<[string, OrganiserLegBoard, boolean]>([
    ["no car and nobody", legOf([]), true],
    ["persons without a car, no car (O1.6)", legOf([], [["c", null]]), false],
    ["a car, nobody without one", legOf([car("r1")]), false],
  ])("%s: %s", (_, leg, empty) => {
    expect(legIsEmpty(organiserPanel([leg])[0])).toBe(empty);
  });
});

describe("organiserPersons (RP4.2)", () => {
  const placement = (personId: string, leg: Leg, rideId: string | null, second: number): PlacementRow => ({
    personId,
    leg,
    rideId,
    placedAt: new Date(Date.UTC(2026, 9, 26, 8, 0, second)),
  });
  const ride = (id: string, leg: Leg, driverId: string): RideRow => ({
    id,
    leg,
    driverId,
    location: "Mairie",
    departureTime: "07:30:00",
    seats: 3,
    note: "Siège enfant",
    position: null,
  });

  /**
   * In the event's order: Léa drives at the aller; Hugo rides with her there and is without
   * a car at the retour; Inès is without a car at the aller; Tom does no leg.
   */
  const rows: BoardRows = {
    persons: [
      { id: "lea", firstName: "Léa" },
      { id: "hugo", firstName: "Hugo" },
      { id: "ines", firstName: "Inès" },
      { id: "tom", firstName: "Tom" },
    ],
    rides: [ride("r1", "aller", "lea")],
    placements: [placement("ines", "aller", null, 1), placement("hugo", "aller", "r1", 2), placement("hugo", "retour", null, 3)],
  };

  it("lists every person in the event's order, a cell per leg, those who do no leg included", () => {
    // toStrictEqual: an id, a first name and the cells, nothing else.
    expect(organiserPersons(rows, ["aller", "retour"])).toStrictEqual([
      {
        id: "lea",
        firstName: "Léa",
        cells: [
          { leg: "aller", state: { kind: "driver", rideId: "r1" } },
          { leg: "retour", state: { kind: "notConcerned" } },
        ],
      },
      {
        id: "hugo",
        firstName: "Hugo",
        cells: [
          { leg: "aller", state: { kind: "passenger", rideId: "r1", driver: { id: "lea", firstName: "Léa" } } },
          { leg: "retour", state: { kind: "withoutCar" } },
        ],
      },
      {
        id: "ines",
        firstName: "Inès",
        cells: [
          { leg: "aller", state: { kind: "withoutCar" } },
          { leg: "retour", state: { kind: "notConcerned" } },
        ],
      },
      {
        id: "tom",
        firstName: "Tom",
        cells: [
          { leg: "aller", state: { kind: "notConcerned" } },
          { leg: "retour", state: { kind: "notConcerned" } },
        ],
      },
    ]);
  });

  it("gives each person one cell in an event without a retour", () => {
    const legs = organiserPersons(rows, ["aller"]).map((person) => person.cells.map((cell) => cell.leg));
    expect(legs).toEqual([["aller"], ["aller"], ["aller"], ["aller"]]);
  });

  it("is empty when nobody has signed up", () => {
    expect(organiserPersons({ persons: [], rides: [], placements: [] }, ["aller", "retour"])).toStrictEqual([]);
  });

  it("carries no number, even from rows that hold one (Q2 = a)", () => {
    const phones: Record<string, string> = {
      lea: "06 11 11 11 11",
      hugo: "06 22 22 22 22",
      ines: "06 33 33 33 33",
      tom: "06 44 44 44 44",
    };
    const sneaky = { ...rows, persons: rows.persons.map((person) => ({ ...person, phone: phones[person.id] })) };
    const sent = JSON.stringify(organiserPersons(sneaky, ["aller", "retour"]));
    expect(sent).not.toContain("phone");
    const digits = (text: string) => text.replace(/\D/g, "");
    expect(Object.values(phones).filter((phone) => digits(sent).includes(digits(phone)))).toEqual([]);
  });
});
