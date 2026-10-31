import { describe, expect, it } from "vitest";
import type { BoardCar, BoardStop, DevicePerson, DeviceState } from "./board";
import { afterRegistration, currentDriver, deviceKnown, driverChoice, findSeat, NEW_DRIVER, passengerCandidates, sheetCandidates, sheetSubmit, tapOutcome, type DeviceStatus } from "./tap";

function of(id: string, state: DeviceState): DevicePerson {
  return { id, firstName: id.toUpperCase(), state };
}

const withoutCar = (id: string) => of(id, { kind: "withoutCar" });
const notConcerned = (id: string) => of(id, { kind: "notConcerned" });
const driver = (id: string) => of(id, { kind: "driver", rideId: `car-of-${id}` });
const passenger = (id: string) =>
  of(id, { kind: "passenger", rideId: "car-of-ana", driver: { id: "ana", firstName: "Ana" } });

describe("deviceKnown (C5.9)", () => {
  it("is true once the device's persons are known: none, or read", () => {
    const known = (["pending", "none", "loading", "ready", "failed"] as const).filter(deviceKnown);
    expect(known).toEqual(["none", "ready"]);
  });
});

describe("afterRegistration (C2.2, C3.6)", () => {
  // The answer carries the device's persons: the next tap on a seat no longer opens the first registration.
  it("makes a device without a person ready, with no reload", () => {
    expect(afterRegistration("none")).toBe("ready");
    expect(tapOutcome(afterRegistration("none"), [withoutCar("lea")])).toEqual({ kind: "place", personId: "lea" });
  });

  it("changes no other status", () => {
    for (const status of ["pending", "loading", "ready", "failed"] as const) {
      expect(afterRegistration(status)).toBe(status);
    }
  });
});

describe("tapOutcome: what a tap on a free seat does", () => {
  it.each<[string, DeviceStatus]>([
    ["the device is not read yet", "pending"],
    ["the device has a key, its persons are still loading (C5.9)", "loading"],
    ["loading the device's persons failed", "failed"],
  ])("C5.9: waits when %s, and never opens the first registration", (_, status) => {
    expect(tapOutcome(status, [])).toEqual({ kind: "wait" });
  });

  it("C5.9: waits while loading, whatever persons an earlier state listed", () => {
    expect(tapOutcome("loading", [withoutCar("lea")])).toEqual({ kind: "wait" });
  });

  it("C5.4: a device without a person opens the first registration", () => {
    expect(tapOutcome("none", [])).toEqual({ kind: "register" });
  });

  it("C5.4: a device whose key no person of the event carries is a device without a person", () => {
    expect(tapOutcome("ready", [])).toEqual({ kind: "register" });
  });

  it("C5.2: exactly one person without a car on the leg is placed, without another step", () => {
    expect(tapOutcome("ready", [withoutCar("lea")])).toEqual({ kind: "place", personId: "lea" });
  });

  it("C5.2: persons not concerned, or already in a car, are not counted", () => {
    expect(tapOutcome("ready", [notConcerned("tom"), passenger("zoe"), withoutCar("lea")])).toEqual({
      kind: "place",
      personId: "lea",
    });
  });

  it.each<[string, DevicePerson[]]>([
    ["two persons without a car", [withoutCar("lea"), withoutCar("tom")]],
    ["only a person not concerned", [notConcerned("tom")]],
    ["only a passenger", [passenger("zoe")]],
  ])("C5.5: opens the sheet with %s", (_, device) => {
    expect(tapOutcome("ready", device)).toEqual({ kind: "sheet" });
  });

  it("C5.6: the driver on the leg is never counted among the persons to place", () => {
    expect(tapOutcome("ready", [driver("marc"), withoutCar("lea")])).toEqual({ kind: "place", personId: "lea" });
    expect(tapOutcome("ready", [driver("marc")])).toEqual({ kind: "sheet" });
  });
});

describe("tapOutcome on a car with Stops (RV3.1, RV3.2, D2)", () => {
  const stop: BoardStop = { id: "s1", location: "Prelles", time: "08:25:00", position: null, passengerIds: [] };
  const withStops = { stops: [stop] };
  const noStops = { stops: [] };

  it("RV3.2: opens the sheet for the only person without a car, who would board in one tap elsewhere", () => {
    expect(tapOutcome("ready", [withoutCar("lea")], noStops)).toEqual({ kind: "place", personId: "lea" });
    expect(tapOutcome("ready", [withoutCar("lea")], withStops)).toEqual({ kind: "sheet" });
  });

  it("RV3.2: opens the sheet whoever the device's persons are", () => {
    expect(tapOutcome("ready", [withoutCar("lea"), withoutCar("tom")], withStops)).toEqual({ kind: "sheet" });
    expect(tapOutcome("ready", [notConcerned("tom"), passenger("zoe")], withStops)).toEqual({ kind: "sheet" });
  });

  it("RV3.1: a car without a Stop behaves as before, and so does a call that names no car", () => {
    expect(tapOutcome("ready", [withoutCar("lea"), withoutCar("tom")], noStops)).toEqual({ kind: "sheet" });
    expect(tapOutcome("ready", [withoutCar("lea")])).toEqual({ kind: "place", personId: "lea" });
  });

  it("Q3: a device without a person still registers, which places at the departure; and nothing before its persons are known", () => {
    expect(tapOutcome("none", [], withStops)).toEqual({ kind: "register" });
    expect(tapOutcome("ready", [], withStops)).toEqual({ kind: "register" });
    expect(tapOutcome("loading", [withoutCar("lea")], withStops)).toEqual({ kind: "wait" });
  });
});

describe("sheetCandidates (C6.1)", () => {
  it("lists the device's persons who are in no car: without a car checked, not concerned unchecked", () => {
    const device = [withoutCar("lea"), driver("marc"), notConcerned("tom"), passenger("zoe"), withoutCar("noe")];
    expect(sheetCandidates(device)).toEqual([
      { id: "lea", firstName: "LEA", checked: true },
      { id: "tom", firstName: "TOM", checked: false },
      { id: "noe", firstName: "NOE", checked: true },
    ]);
  });

  it("is empty when every person of the device drives or is in a car (C6.7)", () => {
    expect(sheetCandidates([driver("marc"), passenger("zoe")])).toEqual([]);
    expect(sheetCandidates([])).toEqual([]);
  });
});

describe("passengerCandidates (C4.13, v4-10)", () => {
  const device = [withoutCar("lea"), driver("marc"), withoutCar("tom"), passenger("zoe"), notConcerned("hugo"), withoutCar("ines")];

  it("lists the device's persons without a car on the leg, in its order, but the one who drives", () => {
    expect(passengerCandidates(device, "tom")).toEqual([
      { id: "lea", firstName: "LEA" },
      { id: "ines", firstName: "INES" },
    ]);
  });

  it("leaves out a driver, a passenger and a person not concerned on the leg", () => {
    expect(passengerCandidates([driver("marc"), passenger("zoe"), notConcerned("hugo")], undefined)).toEqual([]);
  });

  it("lists every person without a car while nobody, or someone new, drives", () => {
    const all = [
      { id: "lea", firstName: "LEA" },
      { id: "tom", firstName: "TOM" },
      { id: "ines", firstName: "INES" },
    ];
    expect(passengerCandidates(device, undefined)).toEqual(all);
    expect(passengerCandidates(device, NEW_DRIVER)).toEqual(all);
  });
});

describe("sheetSubmit", () => {
  it("C6.2: announces how many persons it places", () => {
    expect(sheetSubmit(2, 3)).toEqual({ kind: "ready", count: 2 });
  });

  it("places as many persons as there are free seats", () => {
    expect(sheetSubmit(3, 3)).toEqual({ kind: "ready", count: 3 });
  });

  it("C6.2: is inactive when no person is checked", () => {
    expect(sheetSubmit(0, 3)).toEqual({ kind: "noneChecked", count: 0 });
    expect(sheetSubmit(0, 0)).toEqual({ kind: "noneChecked", count: 0 });
  });

  it("C6.3: is inactive with more persons checked than free seats, and gives the seats left", () => {
    expect(sheetSubmit(4, 3)).toEqual({ kind: "notEnoughSeats", count: 4, freeSeats: 3 });
    expect(sheetSubmit(1, 0)).toEqual({ kind: "notEnoughSeats", count: 1, freeSeats: 0 });
  });
});

describe("driverChoice (R4, C4.6)", () => {
  it("lists the device's persons who do not drive on the leg, in their order, and chooses none of several", () => {
    const device = [withoutCar("lea"), driver("marc"), notConcerned("tom"), passenger("zoe")];
    const candidates = ["lea", "tom", "zoe"].map((id) => ({ id, firstName: id.toUpperCase() }));
    expect(driverChoice(device)).toEqual({ candidates, chosen: undefined });
  });

  it("chooses the only person who can drive", () => {
    expect(driverChoice([driver("marc"), passenger("zoe")])).toEqual({ candidates: [{ id: "zoe", firstName: "ZOE" }], chosen: "zoe" });
  });

  it("without a person who can drive, only a new person: none on the device, or all of them driving", () => {
    expect(driverChoice([])).toEqual({ candidates: [], chosen: "new" });
    expect(driverChoice([driver("marc")])).toEqual({ candidates: [], chosen: "new" });
  });
});

describe("currentDriver (#169, review of #200)", () => {
  const candidates = [{ id: "tom", firstName: "TOM" }];

  it("keeps a choice that still is one: a candidate, or a new person", () => {
    expect(currentDriver(candidates, "tom")).toBe("tom");
    expect(currentDriver(candidates, "new")).toBe("new");
    expect(currentDriver([], "new")).toBe("new");
  });

  it("goes back to the sheet as it opens when the choice is gone: nobody among those left", () => {
    expect(currentDriver(candidates, "lea")).toBeUndefined();
    expect(currentDriver(candidates, undefined)).toBeUndefined();
  });

  it("goes back to a new person when nobody is left who can drive", () => {
    expect(currentDriver([], "lea")).toBe("new");
    expect(currentDriver([], undefined)).toBe("new");
  });
});

describe("findSeat (C3.8, v4-6): « Trouver une place »", () => {
  const car = (id: string, departureTime: string, freeSeats: number) =>
    ({ id, departureTime, freeSeats, full: freeSeats === 0 }) as Pick<BoardCar, "id" | "departureTime" | "freeSeats" | "full">;

  it("finds nothing on a leg without a car", () => {
    expect(findSeat({ cars: [] })).toBeUndefined();
  });

  it("finds nothing when every car is full", () => {
    expect(findSeat({ cars: [car("a", "07:00:00", 0), car("b", "07:30:00", 0)] })).toBeUndefined();
  });

  it("finds the first car with a free seat by departure time: the second one, the first being full", () => {
    const cars = [car("late", "09:00:00", 2), car("full", "07:00:00", 0), car("second", "08:00:00", 1)];
    expect(findSeat({ cars })?.id).toBe("second");
  });

  it("keeps the leg's order between two cars that leave at the same time", () => {
    expect(findSeat({ cars: [car("a", "08:00:00", 1), car("b", "08:00:00", 3)] })?.id).toBe("a");
  });
});
