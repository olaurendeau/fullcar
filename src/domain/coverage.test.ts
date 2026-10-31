import { describe, expect, it } from "vitest";
import { legBoard, type BoardRows, type PlacementRow, type RideRow } from "./board";
import { coverage, coverageBanner, hasBanner } from "./coverage";

function ride(id: string, driverId: string, seats: number): RideRow {
  return { id, leg: "aller", driverId, location: "Gymnase", departureTime: "07:30:00", seats, note: null, position: null };
}

function placed(personId: string, rideId: string | null, leg: RideRow["leg"] = "aller"): PlacementRow {
  return { personId, leg, rideId, stopId: null, placedAt: new Date(Date.UTC(2026, 9, 14)) };
}

/** Every id is also a person of the event; with `allOnDevice`, a person of the device too. */
function aller(rides: RideRow[], placements: PlacementRow[], allOnDevice = false) {
  const ids = new Set([...rides.map((r) => r.driverId), ...placements.map((p) => p.personId)]);
  const data: BoardRows = { persons: [...ids].map((id) => ({ id, firstName: id })), rides, placements, stops: [] };
  return legBoard("aller", data, allOnDevice ? ids : new Set());
}

// Drivers and persons not concerned are in the device section (C2.2, C3.3): N must not
// change whether the persons are the device's or not.
describe.each([
  { device: "seen from another device", allOnDevice: false },
  { device: "with every person on this device", allOnDevice: true },
])("C9.5: coverage gives N, the persons without a car, and M, the free seats, $device", ({ allOnDevice }) => {
  it.each([
    { name: "empty leg", rides: [], placements: [], withoutCar: 0, freeSeats: 0 },
    {
      name: "everybody seated",
      rides: [ride("r1", "marc", 2)],
      placements: [placed("lea", "r1"), placed("tom", "r1")],
      withoutCar: 0,
      freeSeats: 0,
    },
    {
      name: "seats missing",
      rides: [ride("r1", "marc", 1)],
      placements: [placed("lea", "r1"), placed("tom", null), placed("zoe", null)],
      withoutCar: 2,
      freeSeats: 0,
    },
    {
      name: "seats to spare, across cars",
      rides: [ride("r1", "marc", 3), ride("r2", "ana", 4)],
      placements: [placed("lea", "r1"), placed("tom", null)],
      withoutCar: 1,
      freeSeats: 6,
    },
    {
      name: "a driver does not count in N",
      rides: [ride("r1", "marc", 3)],
      placements: [],
      withoutCar: 0,
      freeSeats: 3,
    },
    {
      name: "a driver's own Placement on the leg they drive does not count in N",
      rides: [ride("r1", "marc", 3)],
      placements: [placed("marc", null)],
      withoutCar: 0,
      freeSeats: 3,
    },
    {
      name: "a car over its seats takes no free seat from the others",
      rides: [ride("r1", "marc", 1), ride("r2", "ana", 3)],
      placements: [placed("lea", "r1"), placed("tom", "r1")],
      withoutCar: 0,
      freeSeats: 3,
    },
    {
      name: "a person not concerned does not count in N",
      rides: [],
      placements: [placed("tom", null), placed("absent", null, "retour")],
      withoutCar: 1,
      freeSeats: 0,
    },
  ])("$name", ({ rides, placements, withoutCar, freeSeats }) => {
    expect(coverage(aller(rides, placements, allOnDevice))).toEqual({ withoutCar, freeSeats });
  });
});

// O1.1: the organiser area's legs have no device section; the same count serves them.
it("counts a leg given by its cars and its persons without a car alone", () => {
  const { cars, withoutCar } = aller([ride("r1", "marc", 3)], [placed("lea", "r1"), placed("tom", null)]);
  expect(coverage({ cars, withoutCar })).toEqual({ withoutCar: 1, freeSeats: 2 });
});

describe("C9.1: coverageBanner chooses the form of the banner", () => {
  it("N = 0 and M = 0: everybody has a seat, no free seat to mention", () => {
    expect(coverageBanner({ withoutCar: 0, freeSeats: 0 })).toEqual({ kind: "everyoneSeated", freeSeats: 0 });
  });

  it("N = 0 and M > 0: everybody has a seat, with the free seats", () => {
    expect(coverageBanner({ withoutCar: 0, freeSeats: 3 })).toEqual({ kind: "everyoneSeated", freeSeats: 3 });
  });

  it("N > 0 and M ≥ N: enough seats, N and M", () => {
    expect(coverageBanner({ withoutCar: 2, freeSeats: 2 })).toEqual({ kind: "enoughSeats", withoutCar: 2, freeSeats: 2 });
    expect(coverageBanner({ withoutCar: 1, freeSeats: 5 })).toEqual({ kind: "enoughSeats", withoutCar: 1, freeSeats: 5 });
  });

  it("N > 0 and M < N: seats missing, N and N − M", () => {
    expect(coverageBanner({ withoutCar: 3, freeSeats: 1 })).toEqual({ kind: "missingSeats", withoutCar: 3, missing: 2 });
    expect(coverageBanner({ withoutCar: 1, freeSeats: 0 })).toEqual({ kind: "missingSeats", withoutCar: 1, missing: 1 });
  });
});

describe("C9.1, C9.6: a leg shows the banner when it has a car or a person", () => {
  it("not on an empty leg", () => {
    expect(hasBanner(aller([], []))).toBe(false);
  });

  it("not when its only persons are not concerned by it", () => {
    expect(hasBanner(aller([], [placed("absent", null, "retour")]))).toBe(false);
  });

  it("with a car, even a full one", () => {
    expect(hasBanner(aller([ride("r1", "marc", 1)], [placed("lea", "r1")]))).toBe(true);
    expect(hasBanner(aller([ride("r1", "marc", 3)], []))).toBe(true);
  });

  it("with a person without a car", () => {
    expect(hasBanner(aller([], [placed("tom", null)]))).toBe(true);
  });
});
