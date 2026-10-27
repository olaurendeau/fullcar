/**
 * The organiser area's panel (epic #154): per leg, its coverage, its persons without a
 * car with the numbers DO1 lets the organiser see, and its cars whose driver has no
 * number. Built from what `withOrganiserPhones` gives, the only place that sets `phone`;
 * a car whose driver has a number is only counted (O3.4). Then every person of the event,
 * without any number (epic #645, RP4.2). Plain data, for the browser:
 * types only from `phone-visibility.ts`, which the browser cannot import.
 */
import { buildBoard, type BoardRows } from "./board";
import { coverage, type Coverage } from "./coverage";
import { deviceMatrix, type MatrixRow } from "./device-matrix";
import type { Leg } from "./leg";
import type { PendingNotice } from "./pending-send";
import type { OrganiserLegBoard } from "./phone-visibility";
import type { WallClock, WallDate, WallTime } from "./wall-clock";

/**
 * What the server answers to the organiser area (#3 C4.9, amended by #596): the panel, or a
 * state and nothing else, as organiser-access.ts decides it. `invalid` for an unknown event;
 * `signIn` (OA7.1), `notYours` with the address of the visitor's own session (OA7.2),
 * `pending` (OA7.7), `orphan` (OA7.9), `ended` for the organiser of an anonymised event (OA8.4),
 * with what is left of it and the date of its day 30, when the sign-ups were erased (#598).
 * The panel of an event awaiting confirmation carries its notice, `pending` (OA1.7, OA2.1).
 */
export type OrganiserPanelAnswer =
  | { state: "invalid" | "signIn" | "pending" | "orphan" }
  | { state: "notYours"; email: string }
  | { state: "ended"; event: EndedHeader; erasedOn: WallDate }
  | {
      state: "panel";
      /** The event's options: « Modifier l'événement » needs `stops` (epic #881). */
      options: { stops: boolean };
      legs: OrganiserLeg[];
      persons: OrganiserPerson[];
      pending?: PendingNotice;
    };

/**
 * What an anonymised event keeps, as its organiser's screen shows it (OA8.4): its title, the
 * text of its place and its dates. Only its organiser's session reads the place (Q3 = a).
 */
export interface EndedHeader {
  title: string;
  location: string;
  allerAt: WallClock;
  retourAt: WallClock | null;
}

/**
 * A person of the event, for « Personnes inscrites » (epic #645, RP4.2): an id, a first name
 * and a cell per leg, those of the device's matrix. Never a number (Q2 = a).
 */
export type OrganiserPerson = MatrixRow;

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

/**
 * Every person of `rows`, in the event's order, those who do no leg included, with a cell
 * per leg of `legs`: the matrix of a device that would hold them all. `deviceMatrix` copies
 * each field by name, so that a number a row might carry stays behind.
 */
export function organiserPersons(rows: BoardRows, legs: readonly Leg[]): OrganiserPerson[] {
  const everybody = new Set(rows.persons.map((person) => person.id));
  return deviceMatrix(buildBoard(rows, legs, everybody));
}

/**
 * « Personnes inscrites » in its order (RP4.1): by first name, by `Intl.Collator` in the page's
 * language, case and accents aside, so that two namesakes are side by side; then in the order
 * of sign-up, the event's, which a stable sort keeps. A copy: `persons` is left as it was.
 */
export function byFirstName<P extends { firstName: string }>(persons: readonly P[], locale: string): P[] {
  const { compare } = new Intl.Collator(locale, { sensitivity: "base" });
  return [...persons].sort((a, b) => compare(a.firstName, b.firstName));
}

/** No car and nobody without one: the leg shows the board's empty state (O1.5). */
export function legIsEmpty(leg: OrganiserLeg): boolean {
  return leg.carCount === 0 && leg.withoutCar.length === 0;
}
