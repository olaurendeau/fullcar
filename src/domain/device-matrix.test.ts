import { describe, expect, it } from "vitest";
import type { DeviceState, LegBoard } from "./board";
import { deviceMatrix, matrixSummary, startsExpanded, type MatrixRow } from "./device-matrix";
import type { Leg } from "./leg";

const WITHOUT_CAR: DeviceState = { kind: "withoutCar" };
const NOT_CONCERNED: DeviceState = { kind: "notConcerned" };
const DRIVER: DeviceState = { kind: "driver", rideId: "car-of-claire" };
const WITH_MARC: DeviceState = { kind: "passenger", rideId: "car-of-marc", driver: { id: "marc", firstName: "Marc" } };

/** A leg whose device section holds `states`, by first name, in this order. */
function leg(name: Leg, states: Record<string, DeviceState>): Pick<LegBoard, "leg" | "device"> {
  return {
    leg: name,
    device: Object.entries(states).map(([firstName, state]) => ({ id: firstName.toLowerCase(), firstName, state })),
  };
}

const row = (firstName: string, cells: [Leg, DeviceState][]): MatrixRow => ({
  id: firstName.toLowerCase(),
  firstName,
  cells: cells.map(([leg, state]) => ({ leg, state })),
});

describe("deviceMatrix (C2.2): a row per person of the device, a cell per leg", () => {
  it.each<[string, Pick<LegBoard, "leg" | "device">[], MatrixRow[]]>([
    [
      "an event without a retour: one cell",
      [leg("aller", { Paul: WITHOUT_CAR, Zoé: WITH_MARC })],
      [row("Paul", [["aller", WITHOUT_CAR]]), row("Zoé", [["aller", WITH_MARC]])],
    ],
    [
      "a person not concerned on one leg",
      [leg("aller", { Tom: WITHOUT_CAR }), leg("retour", { Tom: NOT_CONCERNED })],
      [row("Tom", [["aller", WITHOUT_CAR], ["retour", NOT_CONCERNED]])],
    ],
    [
      "a driver on the aller, without a car on the retour",
      [leg("aller", { Claire: DRIVER, Léa: WITH_MARC }), leg("retour", { Claire: WITHOUT_CAR, Léa: NOT_CONCERNED })],
      [
        row("Claire", [["aller", DRIVER], ["retour", WITHOUT_CAR]]),
        row("Léa", [["aller", WITH_MARC], ["retour", NOT_CONCERNED]]),
      ],
    ],
    ["no person on the device", [leg("aller", {}), leg("retour", {})], []],
  ])("%s", (_, board, expected) => {
    expect(deviceMatrix(board)).toEqual(expected);
  });

  it("keeps the event's order, the legs' order, and no number (v4-16)", () => {
    const board = [leg("aller", { Léa: WITH_MARC, Claire: DRIVER }), leg("retour", { Léa: NOT_CONCERNED, Claire: WITHOUT_CAR })];
    const phoned = board.map((legBoard) => ({
      ...legBoard,
      device: legBoard.device.map((person) => ({ ...person, phone: "06 11 22 33 44" })),
    }));
    const rows = deviceMatrix(phoned);
    expect(rows.map((matrixRow) => matrixRow.firstName)).toEqual(["Léa", "Claire"]);
    expect(rows[0].cells.map((cell) => cell.leg)).toEqual(["aller", "retour"]);
    expect(JSON.stringify(rows)).not.toContain("06 11");
    expect(rows[0]).toEqual(row("Léa", [["aller", WITH_MARC], ["retour", NOT_CONCERNED]]));
  });
});

describe("matrixSummary and startsExpanded (C3.6)", () => {
  it.each<[string, MatrixRow[], { persons: number; withoutCar: number }, boolean]>([
    ["no person", [], { persons: 0, withoutCar: 0 }, false],
    [
      "everyone has a seat, or does not make the trip: 0, folded",
      [row("Claire", [["aller", DRIVER], ["retour", NOT_CONCERNED]]), row("Léa", [["aller", WITH_MARC], ["retour", NOT_CONCERNED]])],
      { persons: 2, withoutCar: 0 },
      false,
    ],
    [
      "a person without a car on both legs counts once",
      [row("Tom", [["aller", WITHOUT_CAR], ["retour", WITHOUT_CAR]]), row("Léa", [["aller", WITH_MARC], ["retour", NOT_CONCERNED]])],
      { persons: 2, withoutCar: 1 },
      true,
    ],
    [
      "without a car on one leg only, either one",
      [row("Claire", [["aller", DRIVER], ["retour", WITHOUT_CAR]]), row("Tom", [["aller", WITHOUT_CAR], ["retour", WITH_MARC]])],
      { persons: 2, withoutCar: 2 },
      true,
    ],
  ])("%s", (_, rows, summary, expanded) => {
    expect(matrixSummary(rows)).toEqual(summary);
    expect(startsExpanded(rows)).toBe(expanded);
  });
});
