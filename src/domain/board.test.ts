import { describe, expect, it } from "vitest";
import {
  buildBoard,
  legBoard,
  type BoardRows,
  type PersonRow,
  type PlacementRow,
  type RideRow,
  type StopRow,
} from "./board";

const NONE: ReadonlySet<string> = new Set();

function person(id: string, firstName = id): PersonRow {
  return { id, firstName };
}

function stop(id: string, rideId: string, overrides: Partial<StopRow> = {}): StopRow {
  return { id, rideId, location: "Mairie de Pacé", time: "07:30:00", position: null, ...overrides };
}

function ride(id: string, driverId: string, overrides: Partial<RideRow> = {}): RideRow {
  return {
    id,
    leg: "aller",
    driverId,
    location: "Gymnase",
    departureTime: "07:30:00",
    seats: 3,
    note: null,
    position: null,
    ...overrides,
  };
}

let clock = 0;
function placed(
  personId: string,
  rideId: string | null,
  leg: RideRow["leg"] = "aller",
  stopId: string | null = null,
): PlacementRow {
  clock += 1;
  return { personId, leg, rideId, stopId, placedAt: new Date(Date.UTC(2026, 9, 14, 12, 0, clock)) };
}

function rows(partial: Partial<BoardRows>): BoardRows {
  return { persons: [], rides: [], placements: [], stops: [], ...partial };
}

describe("legBoard: cars", () => {
  it("C4.3: a car shows its driver, place, time, note, and its passengers in boarding order", () => {
    const earlier = placed("tom", "r1");
    const later = placed("lea", "r1");
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc", "Marc"), person("lea", "Léa"), person("tom", "Tom")],
        rides: [
          ride("r1", "marc", {
            location: "Mairie",
            departureTime: "07:15:00",
            note: "Coffre plein",
            position: { lat: 48.5612, lng: 2.6007 },
          }),
        ],
        // Read in any order: the board sorts by boarding time.
        placements: [later, earlier],
      }),
      NONE,
    );

    expect(board.cars).toEqual([
      {
        id: "r1",
        leg: "aller",
        driver: { id: "marc", firstName: "Marc" },
        location: "Mairie",
        departureTime: "07:15:00",
        note: "Coffre plein",
        position: { lat: 48.5612, lng: 2.6007 },
        seats: 3,
        passengers: [
          { id: "tom", firstName: "Tom" },
          { id: "lea", firstName: "Léa" },
        ],
        freeSeats: 1,
        full: false,
        stops: [],
      },
    ]);
  });

  it("a car carries its ride's position, or null when the ride has none", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc"), person("ana")],
        rides: [
          ride("placed", "marc", { departureTime: "07:00:00", position: { lat: -33.86882, lng: 151.20929 } }),
          ride("unplaced", "ana", { departureTime: "08:00:00" }),
        ],
      }),
      NONE,
    );
    expect(board.cars.map((car) => [car.id, car.position])).toStrictEqual([
      ["placed", { lat: -33.86882, lng: 151.20929 }],
      ["unplaced", null],
    ]);
  });

  it("C4.3: free seats are seats minus passengers", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc"), person("lea")],
        rides: [ride("r1", "marc", { seats: 5 })],
        placements: [placed("lea", "r1")],
      }),
      NONE,
    );
    expect(board.cars[0]).toMatchObject({ seats: 5, freeSeats: 4, full: false });
  });

  it("C4.3: a full car has no free seat and is marked full", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc"), person("lea"), person("tom")],
        rides: [ride("r1", "marc", { seats: 2 })],
        placements: [placed("lea", "r1"), placed("tom", "r1")],
      }),
      NONE,
    );
    expect(board.cars[0]).toMatchObject({ freeSeats: 0, full: true });
  });

  it("a car with more passengers than seats has no free seat, never fewer than none", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc"), person("lea"), person("tom")],
        rides: [ride("r1", "marc", { seats: 1 })],
        placements: [placed("lea", "r1"), placed("tom", "r1")],
      }),
      NONE,
    );
    expect(board.cars[0]).toMatchObject({ freeSeats: 0, full: true });
  });

  it("a car without passengers has all its seats free", () => {
    const board = legBoard("aller", rows({ persons: [person("marc")], rides: [ride("r1", "marc")] }), NONE);
    expect(board.cars[0]).toMatchObject({ passengers: [], freeSeats: 3, full: false });
  });

  it("cars are ordered by departure time", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc"), person("ana")],
        rides: [ride("late", "marc", { departureTime: "08:00:00" }), ride("early", "ana", { departureTime: "07:00:00" })],
      }),
      NONE,
    );
    expect(board.cars.map((car) => car.id)).toEqual(["early", "late"]);
  });
});

describe("legBoard: stops (RV8.3)", () => {
  const people = [person("marc"), person("lea"), person("tom"), person("ana")];

  it("a car without a stop has none", () => {
    const board = legBoard("aller", rows({ persons: people, rides: [ride("r1", "marc")] }), NONE);
    expect(board.cars[0].stops).toEqual([]);
  });

  it("three stops come by time, then by the order they were read in", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: people,
        rides: [ride("r1", "marc")],
        stops: [
          stop("a", "r1", { time: "07:10:00", location: "Gare", position: { lat: 48.1, lng: -1.7 } }),
          stop("c", "r1", { time: "07:20:00" }),
          stop("b", "r1", { time: "07:20:00" }),
          stop("z", "r1", { time: "06:55:00" }),
        ],
      }),
      NONE,
    );
    expect(board.cars[0].stops).toEqual([
      { id: "z", location: "Mairie de Pacé", time: "06:55:00", position: null, passengerIds: [] },
      { id: "a", location: "Gare", time: "07:10:00", position: { lat: 48.1, lng: -1.7 }, passengerIds: [] },
      { id: "c", location: "Mairie de Pacé", time: "07:20:00", position: null, passengerIds: [] },
      { id: "b", location: "Mairie de Pacé", time: "07:20:00", position: null, passengerIds: [] },
    ]);
  });

  it("a passenger at stop 2 is in the passengerIds of stop 2 only, in boarding order", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: people,
        rides: [ride("r1", "marc")],
        stops: [stop("s1", "r1", { time: "07:10:00" }), stop("s2", "r1", { time: "07:20:00" })],
        placements: [placed("tom", "r1", "aller", "s2"), placed("lea", "r1", "aller", "s2"), placed("ana", "r1")],
      }),
      NONE,
    );
    expect(board.cars[0].stops.map((s) => [s.id, s.passengerIds])).toEqual([
      ["s1", []],
      ["s2", ["tom", "lea"]],
    ]);
    expect(board.cars[0].passengers.map((p) => p.id)).toEqual(["tom", "lea", "ana"]);
  });

  it("a stopId that is not a stop of the car is ignored, as is the stop of another car", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: people,
        rides: [ride("r1", "marc"), ride("r2", "ana", { departureTime: "08:00:00" })],
        stops: [stop("s1", "r1"), stop("s2", "r2")],
        placements: [placed("lea", "r1", "aller", "s2"), placed("tom", "r1", "aller", "nowhere")],
      }),
      NONE,
    );
    const [first, second] = board.cars;
    expect(first.stops.map((s) => s.passengerIds)).toEqual([[]]);
    expect(second.stops.map((s) => s.passengerIds)).toEqual([[]]);
    expect(first.passengers.map((p) => p.id)).toEqual(["lea", "tom"]);
  });

  it("the retour never has a stop, even when a row says so", () => {
    const data = rows({
      persons: people,
      rides: [ride("r1", "marc", { leg: "retour" })],
      stops: [stop("s1", "r1")],
      placements: [placed("lea", "r1", "retour", "s1")],
    });
    expect(legBoard("retour", data, NONE).cars[0].stops).toEqual([]);
  });
});

describe("legBoard: without a car", () => {
  it("C3.4: lists the persons without a car on the leg, in the order they declared it", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("lea", "Léa"), person("tom", "Tom")],
        placements: [placed("tom", null), placed("lea", null)],
      }),
      NONE,
    );
    expect(board.withoutCar).toEqual([
      { id: "tom", firstName: "Tom" },
      { id: "lea", firstName: "Léa" },
    ]);
  });

  it("C3.3: a person not concerned by the leg is in no list of the leg, neither car nor without a car", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc"), person("lea"), person("absent")],
        rides: [ride("r1", "marc")],
        placements: [placed("lea", null), placed("absent", null, "retour")],
      }),
      NONE,
    );
    const listed = JSON.stringify({ cars: board.cars, withoutCar: board.withoutCar });
    expect(listed).not.toContain("absent");
    expect(board.withoutCar.map((p) => p.id)).toEqual(["lea"]);
  });

  it("C3.3: only the device section shows a person not concerned by the leg", () => {
    const board = legBoard(
      "aller",
      rows({ persons: [person("absent", "Absent")], placements: [placed("absent", null, "retour")] }),
      new Set(["absent"]),
    );
    expect(board.cars).toEqual([]);
    expect(board.withoutCar).toEqual([]);
    expect(board.device).toEqual([{ id: "absent", firstName: "Absent", state: { kind: "notConcerned" } }]);
  });

  it("a placement in a car that is not on the leg's board leaves the person without a car (C12.7)", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc"), person("ana"), person("lea", "Léa"), person("tom")],
        rides: [ride("r1", "marc"), ride("r9", "ana", { leg: "retour" })],
        placements: [placed("lea", "r9"), placed("tom", "gone")],
      }),
      new Set(["lea"]),
    );
    expect(board.withoutCar.map((p) => p.id)).toEqual(["lea", "tom"]);
    expect(board.cars[0]).toMatchObject({ id: "r1", passengers: [], freeSeats: 3 });
    expect(board.device).toEqual([{ id: "lea", firstName: "Léa", state: { kind: "withoutCar" } }]);
  });

  it("a driver's own Placement on the leg they drive is ignored: they are in no list but their car (C12.8)", () => {
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc"), person("lea")],
        rides: [ride("r1", "marc")],
        placements: [placed("marc", null), placed("lea", null)],
      }),
      new Set(["marc"]),
    );
    expect(board.withoutCar.map((p) => p.id)).toEqual(["lea"]);
    expect(board.cars[0].passengers).toEqual([]);
    expect(board.device[0].state).toEqual({ kind: "driver", rideId: "r1" });
  });
});

describe("legBoard: the device's persons (C2.2)", () => {
  const marc = person("marc", "Marc");
  const lea = person("lea", "Léa");
  const tom = person("tom", "Tom");
  const absent = person("absent", "Zoé");
  const all = rows({
    persons: [marc, lea, tom, absent],
    rides: [ride("r1", "marc")],
    placements: [placed("lea", "r1"), placed("tom", null)],
  });

  it("is empty when the device has no person", () => {
    expect(legBoard("aller", all, NONE).device).toEqual([]);
  });

  it("gives each one its state on this leg: drives, passenger of the driver, without a car, not concerned", () => {
    const board = legBoard("aller", all, new Set(["marc", "lea", "tom", "absent"]));
    expect(board.device).toEqual([
      { id: "marc", firstName: "Marc", state: { kind: "driver", rideId: "r1" } },
      {
        id: "lea",
        firstName: "Léa",
        state: { kind: "passenger", rideId: "r1", driver: { id: "marc", firstName: "Marc" } },
      },
      { id: "tom", firstName: "Tom", state: { kind: "withoutCar" } },
      { id: "absent", firstName: "Zoé", state: { kind: "notConcerned" } },
    ]);
  });

  it("lists only the device's persons, and ignores an id the event does not have", () => {
    const board = legBoard("aller", all, new Set(["tom", "elsewhere"]));
    expect(board.device.map((p) => p.id)).toEqual(["tom"]);
  });

  it("a person of the device still appears in the shared lists", () => {
    const board = legBoard("aller", all, new Set(["tom", "lea"]));
    expect(board.withoutCar.map((p) => p.id)).toEqual(["tom"]);
    expect(board.cars[0].passengers.map((p) => p.id)).toEqual(["lea"]);
  });
});

describe("C3.5: aller and retour are independent", () => {
  const base = rows({
    persons: [person("marc"), person("lea"), person("tom")],
    rides: [ride("r1", "marc"), ride("r2", "lea", { leg: "retour", seats: 1 })],
    placements: [placed("lea", "r1"), placed("tom", null), placed("marc", "r2", "retour"), placed("tom", null, "retour")],
  });

  it("a leg's state reads nothing from the other leg", () => {
    const changedRetour = rows({
      persons: base.persons,
      rides: [ride("r1", "marc"), ride("r3", "tom", { leg: "retour" })],
      placements: [placed("lea", "r1"), placed("tom", null), placed("lea", "r3", "retour")],
    });
    const device = new Set(["marc", "lea", "tom"]);
    expect(legBoard("aller", changedRetour, device)).toEqual(legBoard("aller", base, device));
  });

  it("a car is only on the leg it was offered for (C4.2)", () => {
    expect(legBoard("aller", base, NONE).cars.map((car) => car.id)).toEqual(["r1"]);
    expect(legBoard("retour", base, NONE).cars.map((car) => car.id)).toEqual(["r2"]);
  });

  it("the same person has a state of their own on each leg", () => {
    const device = new Set(["marc"]);
    expect(legBoard("aller", base, device).device[0].state).toEqual({ kind: "driver", rideId: "r1" });
    expect(legBoard("retour", base, device).device[0].state).toMatchObject({ kind: "passenger", rideId: "r2" });
  });
});

describe("legBoard: the persons not concerned (PL1.4)", () => {
  const data = rows({
    persons: [person("marc", "Marc"), person("lea", "Léa"), person("tom", "Tom"), person("zoe", "Zoé"), person("sam", "Sam")],
    rides: [ride("r1", "marc"), ride("r2", "sam", { leg: "retour" })],
    // Léa is a passenger and Tom without a car at the aller; Zoé does neither leg.
    placements: [placed("lea", "r1"), placed("tom", null), placed("lea", null, "retour")],
  });

  it("lists, in the event's order, the persons with no Placement on the leg who do not drive it", () => {
    expect(legBoard("aller", data, NONE).notConcerned).toEqual([
      { id: "zoe", firstName: "Zoé" },
      { id: "sam", firstName: "Sam" },
    ]);
    expect(legBoard("retour", data, NONE).notConcerned).toEqual([
      { id: "marc", firstName: "Marc" },
      { id: "tom", firstName: "Tom" },
      { id: "zoe", firstName: "Zoé" },
    ]);
  });

  it("a driver of the leg is not in it, even with a Placement of their own", () => {
    const board = legBoard("aller", rows({ ...data, placements: [placed("marc", null)] }), NONE);
    expect(board.notConcerned.map((p) => p.id)).not.toContain("marc");
    expect(board.withoutCar).toEqual([]);
  });

  it("a person without a car or a passenger is not in it", () => {
    const ids = legBoard("aller", data, NONE).notConcerned.map((p) => p.id);
    expect(ids).not.toContain("lea");
    expect(ids).not.toContain("tom");
  });

  it("a person who does no leg is in both lists", () => {
    expect(buildBoard(data, ["aller", "retour"], NONE).map((leg) => leg.notConcerned.map((p) => p.id))).toEqual([
      ["zoe", "sam"],
      ["marc", "tom", "zoe"],
    ]);
  });

  it("carries the first name and the id, and nothing else, whatever the device", () => {
    for (const deviceIds of [NONE, new Set(["zoe", "sam"])]) {
      for (const person of legBoard("aller", data, deviceIds).notConcerned) {
        expect(Object.keys(person).sort()).toEqual(["firstName", "id"]);
      }
    }
  });

  it("an event without a retour has no retour list", () => {
    const board = buildBoard(data, ["aller"], NONE);
    expect(board.map((leg) => leg.leg)).toEqual(["aller"]);
    expect(board.flatMap((leg) => leg.notConcerned).length).toBe(2);
  });
});

describe("buildBoard", () => {
  it("one state per leg of the event, aller first", () => {
    const data = rows({ persons: [person("lea")], placements: [placed("lea", null, "retour")] });
    const board = buildBoard(data, ["aller", "retour"], NONE);
    expect(board.map((leg) => leg.leg)).toEqual(["aller", "retour"]);
    expect(board[1]).toEqual(legBoard("retour", data, NONE));
  });

  it("an event without a retour has the aller only", () => {
    expect(buildBoard(rows({}), ["aller"], NONE).map((leg) => leg.leg)).toEqual(["aller"]);
  });

  it("is plain data: it survives a JSON round trip unchanged", () => {
    const board = buildBoard(
      rows({ persons: [person("marc"), person("lea")], rides: [ride("r1", "marc")], placements: [placed("lea", "r1")] }),
      ["aller", "retour"],
      new Set(["lea"]),
    );
    expect(JSON.parse(JSON.stringify(board))).toEqual(board);
  });
});
