import type { VisibleCar, VisibleDevicePerson } from "./phone-visibility";

/**
 * What a car's card asks the device (event-board v4.8, rule 1): a number for `personId`, the
 * device's person who drives that car, else its first passenger of the device in the card's order.
 * `driver`, the words for the people on board (v4.8-3); `passenger`, those that name who drives.
 */
export type PhoneAsk =
  | { kind: "driver"; personId: string; firstName: string }
  | { kind: "passenger"; personId: string; firstName: string; driver: string };

/**
 * Whether `car`'s card asks the device for a number: when it has at least one person in that car,
 * driving or seated, and none of them has a number. One number is enough (v4.8-2). The numbers read
 * are those `withVisiblePhones` already set on the device's persons; nobody else's absence of a
 * number is ever told (Q2 b, v4.8-7). Null when nothing is asked.
 */
export function phoneAsk(car: Pick<VisibleCar, "driver" | "passengers">, device: readonly VisibleDevicePerson[]): PhoneAsk | null {
  const own = new Map(device.map((person) => [person.id, person]));
  const members = [car.driver, ...car.passengers].flatMap((member) => own.get(member.id) ?? []);
  const [asked] = members;
  if (!asked || members.some((member) => member.phone)) return null;
  const { id: personId, firstName } = asked;
  return personId === car.driver.id ? { kind: "driver", personId, firstName } : { kind: "passenger", personId, firstName, driver: car.driver.firstName };
}
