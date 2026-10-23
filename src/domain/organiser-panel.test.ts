import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BoardPerson } from "./board";
import type { Leg } from "./leg";
import { legIsEmpty, organiserPanel, type OrganiserLeg } from "./organiser-panel";
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
