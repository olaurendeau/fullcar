import { describe, expect, it } from "vitest";
import { buildBoard, legBoard, type BoardRows, type PersonRow, type PlacementRow, type RideRow } from "./board";

const NONE: ReadonlySet<string> = new Set();

function person(id: string, firstName = id): PersonRow {
  return { id, firstName };
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
    ...overrides,
  };
}

let clock = 0;
function placed(personId: string, rideId: string | null, leg: RideRow["leg"] = "aller"): PlacementRow {
  clock += 1;
  return { personId, leg, rideId, placedAt: new Date(Date.UTC(2026, 9, 14, 12, 0, clock)) };
}

function rows(partial: Partial<BoardRows>): BoardRows {
  return { persons: [], rides: [], placements: [], ...partial };
}

describe("legBoard: cars", () => {
  it("C4.3: a car shows its driver, place, time, note, and its passengers in boarding order", () => {
    const earlier = placed("tom", "r1");
    const later = placed("lea", "r1");
    const board = legBoard(
      "aller",
      rows({
        persons: [person("marc", "Marc"), person("lea", "Léa"), person("tom", "Tom")],
        rides: [ride("r1", "marc", { location: "Mairie", departureTime: "07:15:00", note: "Coffre plein" })],
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
        seats: 3,
        passengers: [
          { id: "tom", firstName: "Tom" },
          { id: "lea", firstName: "Léa" },
        ],
        freeSeats: 1,
        full: false,
      },
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

  it("a placement in a car that is not on the board leaves the person without a car", () => {
    const board = legBoard(
      "aller",
      rows({ persons: [person("lea")], placements: [placed("lea", "gone")] }),
      NONE,
    );
    expect(board.withoutCar.map((p) => p.id)).toEqual(["lea"]);
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
