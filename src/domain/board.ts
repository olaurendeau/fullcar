/**
 * The state of each leg, built from an event's rows (epic #66, C2.2, C3.3, C4.3): its
 * cars, its persons without a car, and where each of the device's persons stands.
 *
 * Plain data, ready to cross from the server to the browser. Contact numbers are not
 * part of it: the visibility rule adds them afterwards, car by car (#77).
 */
import type { Leg } from "./leg";
import type { Position } from "./place";
import type { WallTime } from "./wall-clock";

/** The rows of one event, as read from the database. */
export interface PersonRow {
  id: string;
  firstName: string;
}

export interface RideRow {
  id: string;
  leg: Leg;
  driverId: string;
  location: string;
  /** `HH:MM:SS`, as Postgres returns a `time(0)`; the date is the leg's. */
  departureTime: WallTime;
  /** Passenger seats, driver excluded. */
  seats: number;
  note: string | null;
  /** The position of `location`, or `null` when it has none. */
  position: Position | null;
}

/** A person's Placement on a leg: in a car, or without a car when `rideId` is null. */
export interface PlacementRow {
  personId: string;
  leg: Leg;
  rideId: string | null;
  /** When the person boarded, or declared being without a car: gives the order. */
  placedAt: Date;
}

export interface BoardRows {
  persons: readonly PersonRow[];
  rides: readonly RideRow[];
  placements: readonly PlacementRow[];
}

export interface BoardPerson {
  id: string;
  firstName: string;
}

export interface BoardCar {
  id: string;
  leg: Leg;
  driver: BoardPerson;
  location: string;
  departureTime: WallTime;
  note: string | null;
  /** The position of `location`, or `null`. */
  position: Position | null;
  seats: number;
  /** In boarding order. */
  passengers: BoardPerson[];
  freeSeats: number;
  /** No free seat left: the card says « Complet ». */
  full: boolean;
}

/** Where one of the device's persons stands on the leg (C2.2). */
export type DeviceState =
  | { kind: "driver"; rideId: string }
  | { kind: "passenger"; rideId: string; driver: BoardPerson }
  | { kind: "withoutCar" }
  | { kind: "notConcerned" };

export interface DevicePerson extends BoardPerson {
  state: DeviceState;
}

export interface LegBoard {
  leg: Leg;
  /** By departure time. */
  cars: BoardCar[];
  /** In the order they declared it. Persons not concerned are in no list (C3.3). */
  withoutCar: BoardPerson[];
  /** The device's persons, in the event's order; empty when the device has none. */
  device: DevicePerson[];
}

export type Board = LegBoard[];

function byPlacedAt(a: PlacementRow, b: PlacementRow): number {
  return a.placedAt.getTime() - b.placedAt.getTime();
}

function byDepartureTime(a: BoardCar, b: BoardCar): number {
  return a.departureTime < b.departureTime ? -1 : a.departureTime > b.departureTime ? 1 : 0;
}

/**
 * One leg's state. It reads only the rides and Placements of `leg`, so that nothing done
 * on the other leg can change it (C3.5).
 */
export function legBoard(leg: Leg, rows: BoardRows, deviceIds: ReadonlySet<string>): LegBoard {
  const persons = new Map(rows.persons.map((person) => [person.id, { id: person.id, firstName: person.firstName }]));
  const personOf = (id: string): BoardPerson[] => {
    const person = persons.get(id);
    return person ? [{ ...person }] : [];
  };

  const legRides = rows.rides.filter((ride) => ride.leg === leg);
  const drivers = new Map(legRides.map((ride) => [ride.driverId, ride.id]));
  // A driver has no Placement on the leg they drive (C12.8): one read anyway is ignored.
  const placements = rows.placements
    .filter((placement) => placement.leg === leg && persons.has(placement.personId) && !drivers.has(placement.personId))
    .sort(byPlacedAt);

  const cars = legRides
    .flatMap((ride): BoardCar[] =>
      personOf(ride.driverId).map((driver) => {
        const passengers = placements
          .filter((placement) => placement.rideId === ride.id)
          .flatMap((placement) => personOf(placement.personId));
        const freeSeats = Math.max(0, ride.seats - passengers.length);
        return {
          id: ride.id,
          leg,
          driver,
          location: ride.location,
          departureTime: ride.departureTime,
          note: ride.note,
          position: ride.position,
          seats: ride.seats,
          passengers,
          freeSeats,
          full: freeSeats === 0,
        };
      }),
    )
    .sort(byDepartureTime);
  const carById = new Map(cars.map((car) => [car.id, car]));

  // In a car that is not on this leg's board, a person is without a car.
  const carOf = (placement: PlacementRow): BoardCar | undefined =>
    placement.rideId === null ? undefined : carById.get(placement.rideId);
  const withoutCar = placements
    .filter((placement) => carOf(placement) === undefined)
    .flatMap((placement) => personOf(placement.personId));

  const stateOf = (id: string): DeviceState => {
    const driving = drivers.get(id);
    if (driving !== undefined && carById.has(driving)) return { kind: "driver", rideId: driving };
    const placement = placements.find((candidate) => candidate.personId === id);
    if (placement === undefined) return { kind: "notConcerned" };
    const car = carOf(placement);
    if (car === undefined) return { kind: "withoutCar" };
    return { kind: "passenger", rideId: car.id, driver: { ...car.driver } };
  };

  const device = rows.persons
    .filter((person) => deviceIds.has(person.id))
    .map((person): DevicePerson => ({ id: person.id, firstName: person.firstName, state: stateOf(person.id) }));

  return { leg, cars, withoutCar, device };
}

/** The state of each of the event's legs, in the order given (`eventLegs`). */
export function buildBoard(rows: BoardRows, legs: readonly Leg[], deviceIds: ReadonlySet<string>): Board {
  return legs.map((leg) => legBoard(leg, rows, deviceIds));
}
