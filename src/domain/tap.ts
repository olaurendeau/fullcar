/**
 * What a tap on a free seat does (epic #66, R5), and the sheet that chooses who boards
 * (R6). Pure decisions on the leg's device section (`LegBoard.device`): the view asks,
 * the server still decides at the write (C5.7, C6.5).
 */
import type { DevicePerson } from "./board";

/**
 * What the page knows of the device's persons on this event.
 * - `pending`: not read yet from the browser.
 * - `none`: the device has no key for this event, hence no person.
 * - `loading`: it has one, and its persons are being read (C5.9).
 * - `ready`: its persons are known.
 * - `failed`: reading them failed; the page offers to retry.
 */
export type DeviceStatus = "pending" | "none" | "loading" | "ready" | "failed";

/**
 * Whether the device's persons are known: none, or read. Until then, the free seats and the
 * actions that create are inactive, or they would open as for a device without a person (C5.9).
 */
export function deviceKnown(status: DeviceStatus): boolean {
  return status === "none" || status === "ready";
}

export type TapOutcome =
  /** The device's persons are not known yet: the seat does nothing (C5.9). */
  | { kind: "wait" }
  /** No person on the device: the first registration, which places directly (C5.4). */
  | { kind: "register" }
  /** The only person of the device without a car on the leg boards, in one tap (C5.2). */
  | { kind: "place"; personId: string }
  /** Anything else: the sheet chooses who boards (C5.5). */
  | { kind: "sheet" };

/**
 * `device` is the device section of the tapped seat's leg. Only persons without a car on
 * that leg are counted: a driver, a passenger or a person not concerned never is (C5.6).
 */
export function tapOutcome(status: DeviceStatus, device: readonly DevicePerson[]): TapOutcome {
  if (!deviceKnown(status)) return { kind: "wait" };
  if (status === "none") return { kind: "register" };
  // A key that no person of the event carries is a device without a person.
  if (device.length === 0) return { kind: "register" };
  const toPlace = device.filter((person) => person.state.kind === "withoutCar");
  return toPlace.length === 1 ? { kind: "place", personId: toPlace[0].id } : { kind: "sheet" };
}

export interface SheetCandidate {
  id: string;
  firstName: string;
  checked: boolean;
}

/**
 * The persons of the sheet (C6.1): the device's persons in no car on the leg, those
 * without a car checked, those not concerned unchecked. Drivers and passengers of the leg
 * are left out; an empty list is the driver's path to add a person (C6.7).
 */
export function sheetCandidates(device: readonly DevicePerson[]): SheetCandidate[] {
  return device.flatMap(({ id, firstName, state }) =>
    state.kind === "withoutCar" || state.kind === "notConcerned"
      ? [{ id, firstName, checked: state.kind === "withoutCar" }]
      : [],
  );
}

export type SheetSubmit =
  /** « Placer {count} personnes ». */
  | { kind: "ready"; count: number }
  /** Inactive: nobody is checked (C6.2). */
  | { kind: "noneChecked"; count: 0 }
  /** Inactive: « Il reste {freeSeats} place(s) dans cette voiture » (C6.3). */
  | { kind: "notEnoughSeats"; count: number; freeSeats: number };

/** The sheet's button, for `checked` persons and the car's `freeSeats`. */
export function sheetSubmit(checked: number, freeSeats: number): SheetSubmit {
  if (checked === 0) return { kind: "noneChecked", count: 0 };
  if (checked > freeSeats) return { kind: "notEnoughSeats", count: checked, freeSeats };
  return { kind: "ready", count: checked };
}
