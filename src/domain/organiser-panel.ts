/**
 * The organiser area's panel (epic #154): per leg, its coverage, its persons without a
 * car with the numbers DO1 lets the organiser see, and its cars whose driver has no
 * number. Built from what `withOrganiserPhones` gives, the only place that sets `phone`;
 * a car whose driver has a number is only counted (O3.4). Plain data, for the browser:
 * types only from `phone-visibility.ts`, which the browser cannot import.
 */
import { coverage, type Coverage } from "./coverage";
import type { Leg } from "./leg";
import type { OrganiserLegBoard } from "./phone-visibility";
import type { WallTime } from "./wall-clock";

/** What the server answers to the organiser area: « invalid » and nothing else, or the panel (#3 C4.9, amended). */
export type OrganiserPanelAnswer = { state: "invalid" } | { state: "panel"; legs: OrganiserLeg[] };

export interface OrganiserLeg {
  leg: Leg;
  /** N and M, those of the board's banner. */
  coverage: Coverage;
  carCount: number;
  /** As declared; a number only as DO1 says. */
  withoutCar: { id: string; firstName: string; phone: string | null }[];
  /** By departure time; only the cars whose driver has no number. */
  carsWithoutPhone: CarWithoutPhone[];
}

export interface CarWithoutPhone {
  id: string;
  driverFirstName: string;
  departureTime: WallTime;
  location: string;
  /** The passengers on board. */
  taken: number;
  free: number;
}

/** The panel's legs, in the order given. Every field is copied by name: nothing else rides along. */
export function organiserPanel(legs: OrganiserLegBoard[]): OrganiserLeg[] {
  return legs.map((leg) => ({
    leg: leg.leg,
    coverage: coverage(leg),
    carCount: leg.cars.length,
    withoutCar: leg.withoutCar.map(({ id, firstName, phone }) => ({ id, firstName, phone })),
    carsWithoutPhone: leg.cars
      .filter((car) => !car.driverHasPhone)
      .map((car) => ({
        id: car.id,
        driverFirstName: car.driver.firstName,
        departureTime: car.departureTime,
        location: car.location,
        taken: car.passengers.length,
        free: car.freeSeats,
      })),
  }));
}

/** No car and nobody without one: the leg shows the board's empty state (O1.5). */
export function legIsEmpty(leg: OrganiserLeg): boolean {
  return leg.carCount === 0 && leg.withoutCar.length === 0;
}
