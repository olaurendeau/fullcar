/**
 * Who sees a phone number (epic #66, R10, D2; epic #154, DO1). The only place of this rule:
 * every read goes through `withVisiblePhones` or `withOrganiserPhones`, and nothing else
 * derives it again (C10.5).
 *
 * A person's number is sent to a device in two cases only (C10.1):
 * - the device has a person in the same car, on the same leg, driver included, both ways;
 * - the person is one of the device's persons.
 *
 * The organiser (DO1, decided by the human on 2026-10-18) also receives, in the answer of
 * the organiser area only, and only with the event's admin token, checked here, the number
 * of each person without a car on a leg, in that leg's list without a car. For a car, the
 * answer says only whether its driver has a number, never which. It carries no number of a
 * driver, of a placed passenger or of a person not concerned. Everywhere else, the
 * participants' board of `/e/{id}/admin` included, the devices' rule above stays.
 */
import { adminTokenMatches } from "./admin-token";
import type { Board, BoardCar, BoardPerson, DevicePerson, LegBoard } from "./board";
import type { Leg } from "./leg";

/**
 * The numbers of an event's persons, read apart from the rest of the rows: only
 * `withVisiblePhones` and `withOrganiserPhones` receive them. A person without a number is
 * absent, or `null`.
 */
export type PhonesById = ReadonlyMap<string, string | null>;

/** The persons of one car, on its one leg. */
export type CarMembers = Pick<BoardCar, "driver" | "passengers">;

export interface PhoneQuestion {
  subjectId: string;
  /** The car where the number would be shown, `null` outside any car. */
  car: CarMembers | null;
  deviceIds: ReadonlySet<string>;
}

export function phoneVisible({ subjectId, car, deviceIds }: PhoneQuestion): boolean {
  if (deviceIds.has(subjectId)) return true;
  if (car === null) return false;
  const members = [car.driver, ...car.passengers].map((person) => person.id);
  return members.includes(subjectId) && members.some((id) => deviceIds.has(id));
}

export interface PhonePerson extends BoardPerson {
  /** `null` when the device may not see it, or when there is none. */
  phone: string | null;
}

export interface VisibleCar extends Omit<BoardCar, "driver" | "passengers"> {
  driver: PhonePerson;
  passengers: PhonePerson[];
}

export interface VisibleDevicePerson extends DevicePerson {
  phone: string | null;
}

export interface VisibleLegBoard extends Omit<LegBoard, "cars" | "device"> {
  cars: VisibleCar[];
  device: VisibleDevicePerson[];
}

export type VisibleBoard = VisibleLegBoard[];

/**
 * Sets the numbers the device may see, car by car and in the device's section, never on
 * the person: the passenger of the aller does not see their driver's number on the retour,
 * where they share no car (C10.3). The list without a car carries no number. The board
 * given is left as it was.
 */
export function withVisiblePhones(board: Board, phonesById: PhonesById, deviceIds: ReadonlySet<string>): VisibleBoard {
  const phoneOf = (subjectId: string, car: CarMembers | null): string | null =>
    phoneVisible({ subjectId, car, deviceIds }) ? (phonesById.get(subjectId) ?? null) : null;

  return board.map((leg) => ({
    ...leg,
    cars: leg.cars.map((car) => {
      const withPhone = (person: BoardPerson): PhonePerson => ({ ...person, phone: phoneOf(person.id, car) });
      return { ...car, driver: withPhone(car.driver), passengers: car.passengers.map(withPhone) };
    }),
    device: leg.device.map((person) => ({ ...person, phone: phoneOf(person.id, null) })),
  }));
}

/** What the organiser presents: the token received in the request's body, and the hash the event keeps. */
export interface OrganiserProof {
  token: unknown;
  storedHash: string | undefined;
}

/** A car as the organiser area sees it: whether its driver has a number, never the number. */
export interface OrganiserCar extends BoardCar {
  driverHasPhone: boolean;
}

export interface OrganiserLegBoard {
  leg: Leg;
  /** The board's order, by departure time. */
  cars: OrganiserCar[];
  /** The board's order, as declared; the only place where a number is set. */
  withoutCar: PhonePerson[];
}

/**
 * The organiser area's legs (DO1), or `undefined` when the token is not the event's one:
 * wrong, absent, not a string, or no stored hash. The rule checks the token itself, so that
 * no caller can tell it « checked » by mistake. A number is set only in the list without a
 * car of the leg where the person is without a car. The board given is built without a
 * device; its device section is not taken, and the board is left as it was. Only the known
 * fields are copied, one by one: TypeScript accepts a `VisibleBoard` for a `Board`, and a
 * spread would carry its numbers along.
 */
export function withOrganiserPhones(
  board: Board,
  phonesById: PhonesById,
  { token, storedHash }: OrganiserProof,
): OrganiserLegBoard[] | undefined {
  if (!adminTokenMatches(token, storedHash)) return undefined;
  // An empty number is no number: no `tel:` link, and the driver counts as having none.
  const phoneOf = (subjectId: string): string | null => {
    const phone = phonesById.get(subjectId);
    return phone === undefined || phone === "" ? null : phone;
  };

  return board.map(({ leg, cars, withoutCar }) => ({
    leg,
    cars: cars.map((car) => ({
      id: car.id,
      leg: car.leg,
      driver: personOnly(car.driver),
      location: car.location,
      departureTime: car.departureTime,
      note: car.note,
      seats: car.seats,
      passengers: car.passengers.map(personOnly),
      freeSeats: car.freeSeats,
      full: car.full,
      driverHasPhone: phoneOf(car.driver.id) !== null,
    })),
    withoutCar: withoutCar.map((person) => ({ ...personOnly(person), phone: phoneOf(person.id) })),
  }));
}

function personOnly({ id, firstName }: BoardPerson): BoardPerson {
  return { id, firstName };
}
