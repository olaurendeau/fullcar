/**
 * A leg's coverage (epic #66, R9): N, the persons without a car, against M, the free
 * seats of all its cars. Drivers and persons not concerned are in no list of the leg's
 * board, so they never count in N (C9.5).
 */
import type { LegBoard } from "./board";

export interface Coverage {
  /** N. */
  withoutCar: number;
  /** M. */
  freeSeats: number;
}

export function coverage(leg: LegBoard): Coverage {
  return {
    withoutCar: leg.withoutCar.length,
    freeSeats: leg.cars.reduce((sum, car) => sum + car.freeSeats, 0),
  };
}

/** The form of the banner, its numbers for the view to translate (C9.1). */
export type CoverageBanner =
  /** N = 0: « Tout le monde a une place », then the free seats if M > 0. */
  | { kind: "everyoneSeated"; freeSeats: number }
  /** N > 0 and M ≥ N: « N sans voiture · M places libres ». */
  | { kind: "enoughSeats"; withoutCar: number; freeSeats: number }
  /** N > 0 and M < N: « N sans voiture · il manque N − M places ». */
  | { kind: "missingSeats"; withoutCar: number; missing: number };

export function coverageBanner({ withoutCar, freeSeats }: Coverage): CoverageBanner {
  if (withoutCar === 0) return { kind: "everyoneSeated", freeSeats };
  if (freeSeats >= withoutCar) return { kind: "enoughSeats", withoutCar, freeSeats };
  return { kind: "missingSeats", withoutCar, missing: withoutCar - freeSeats };
}

/**
 * A leg with at least a car or a person on it shows the banner; an empty leg shows the
 * empty state instead (C9.1, C9.6). Persons not concerned are not on the leg.
 */
export function hasBanner(leg: LegBoard): boolean {
  return leg.cars.length > 0 || leg.withoutCar.length > 0;
}
