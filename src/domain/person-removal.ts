/**
 * Removing a person (epic #645, remove-person v2): what the confirmation says, leg by leg,
 * counted on the state the page shows, never read again from the server (decision 15, as
 * « Retirer la voiture »). The same rule for the device and the organiser area: a driver's
 * car goes with her, and her passengers are without a car again on that leg; a passenger's
 * seat is freed; without a car, or not concerned, nothing is said.
 */
import type { BoardPerson } from "./board";
import type { Leg } from "./leg";

/** A car as a page shows it: the device's board or the organiser area's, numbers or not. */
export interface ShownCar {
  driver: BoardPerson;
  passengers: readonly BoardPerson[];
}

/** A leg as a page shows it. */
export interface ShownLeg {
  leg: Leg;
  cars: readonly ShownCar[];
}

/**
 * One line of the confirmation:
 * - `drives`: `PersonRemoval.drives`, her car on that leg goes, and `passengers` are without
 *   a car again (no number at 0);
 * - `passenger`: `PersonRemoval.passenger`, her seat in the car of `driver` (a first name) is freed.
 */
export type RemovalLine =
  | { key: "drives"; leg: Leg; passengers: number }
  | { key: "passenger"; leg: Leg; driver: string };

export interface RemovalConfirmation {
  /** One per leg where she drives or sits in a car, in the order of the legs (RP1.2). */
  lines: RemovalLine[];
  /**
   * The `cars` of `PersonRemoval.notified`, said on the device when 1 or more: her cars that
   * have a passenger, plus those she sits in.
   */
  cars: number;
}

/** The confirmation of the removal of `personId`, from `legs` as the page shows them. */
export function removalConfirmation(legs: readonly ShownLeg[], personId: string): RemovalConfirmation {
  const lines: RemovalLine[] = [];
  let cars = 0;
  for (const { leg, cars: shown } of legs) {
    const driven = shown.find((car) => car.driver.id === personId);
    if (driven !== undefined) {
      const passengers = driven.passengers.length;
      lines.push({ key: "drives", leg, passengers });
      if (passengers > 0) cars++;
      continue;
    }
    const seat = shown.find((car) => car.passengers.some((passenger) => passenger.id === personId));
    if (seat !== undefined) {
      lines.push({ key: "passenger", leg, driver: seat.driver.firstName });
      cars++;
    }
  }
  return { lines, cars };
}
