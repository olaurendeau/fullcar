import { describe, expect, it } from "vitest";
import type { DevicePerson, DeviceState } from "./board";
import { sheetCandidates, sheetSubmit, tapOutcome, type DeviceStatus } from "./tap";

function of(id: string, state: DeviceState): DevicePerson {
  return { id, firstName: id.toUpperCase(), state };
}

const withoutCar = (id: string) => of(id, { kind: "withoutCar" });
const notConcerned = (id: string) => of(id, { kind: "notConcerned" });
const driver = (id: string) => of(id, { kind: "driver", rideId: `car-of-${id}` });
const passenger = (id: string) =>
  of(id, { kind: "passenger", rideId: "car-of-ana", driver: { id: "ana", firstName: "Ana" } });

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
