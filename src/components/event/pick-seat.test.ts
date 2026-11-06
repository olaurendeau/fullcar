import { describe, expect, it } from "vitest";
import { pickSeatEnded, pickedOn, type PickSeat } from "./pick-seat";

// #983, event-board v5.2, PL3.8: the mode of « Trouver une place » for a person of another device.

const LEA: PickSeat = { personId: "lea", firstName: "Léa", leg: "retour" };
const PAGE = { tab: "retour", said: true } as const;

describe("pickSeatEnded: what ends the mode without a tap", () => {
  it("stands while the page shows its leg, the bar still says it", () => {
    expect(pickSeatEnded(LEA, PAGE)).toBe(false);
  });

  it("ends when the bar no longer says it: « Fermer », Escape, or another information", () => {
    expect(pickSeatEnded(LEA, { ...PAGE, said: false })).toBe(true);
  });

  it("ends when the other leg's tab becomes active (hypothesis for D4)", () => {
    expect(pickSeatEnded(LEA, { ...PAGE, tab: "aller" })).toBe(true);
  });

  it("has nothing to end without a mode", () => {
    expect(pickSeatEnded(null, { tab: "aller", said: false })).toBe(false);
  });
});

describe("pickedOn: who a tap on a free seat seats", () => {
  const board = (leg: "aller" | "retour", withoutCar: { id: string; firstName: string }[]) => ({ leg, withoutCar });

  it("is the person of the mode, as the leg shows her now, on the leg of the mode", () => {
    expect(pickedOn(LEA, board("retour", [{ id: "tom", firstName: "Tom" }, { id: "lea", firstName: "Léa" }]))).toEqual({ id: "lea", firstName: "Léa" });
  });

  it("is nobody on the other leg", () => {
    expect(pickedOn(LEA, board("aller", [{ id: "lea", firstName: "Léa" }]))).toBeUndefined();
  });

  it("is nobody once the leg no longer lists her without a car: the tap follows the rule of today", () => {
    expect(pickedOn(LEA, board("retour", [{ id: "tom", firstName: "Tom" }]))).toBeUndefined();
  });

  it("is nobody without a mode", () => {
    expect(pickedOn(null, board("retour", [{ id: "lea", firstName: "Léa" }]))).toBeUndefined();
  });
});
