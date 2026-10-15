/**
 * Who sees a phone number (epic #66, R10, D2). The only place of this rule: every read
 * goes through `withVisiblePhones`, and nothing else derives it again (C10.5).
 *
 * A person's number is sent to a device in two cases only (C10.1):
 * - the device has a person in the same car, on the same leg, driver included, both ways;
 * - the person is one of the device's persons.
 *
 * The organiser sees no more for now (C10.6): the admin comes with « Administrer
 * l'événement », and has no place in this rule until then.
 */
import type { Board, BoardCar, BoardPerson, DevicePerson, LegBoard } from "./board";

/**
 * The numbers of an event's persons, read apart from the rest of the rows: only
 * `withVisiblePhones` receives them. A person without a number is absent, or `null`.
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
