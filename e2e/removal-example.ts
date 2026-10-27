import type { Kysely } from "kysely";
import type { Database } from "@/db/schema";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import type { Leg } from "@/domain/leg";
import type { Position } from "@/domain/place";

/*
 * The example of docs/design/remove-person/ (v2, « L’exemple »), for the end-to-end tests of
 * removing a person: every number they check comes from it.
 */

export const PHONES = { marc: "06 11 22 33 44", lea: "06 12 34 56 78", tom: "06 98 76 54 32" };

/**
 * The device of `token` holds Marc, Léa and Tom; Inès is on `inesToken`'s, if given. Aller: Marc
 * drives Inès, Hugo and Léa, in his 3 seats, from `marcAt` if given; Claire drives Sophie, one seat
 * left; Tom is without a car. Retour: Sophie drives Marc; Léa, Inès and Hugo are without a car;
 * Tom is not concerned.
 */
export async function seedExample(db: Kysely<Database>, eventId: string, token: string, { inesToken, marcAt }: { inesToken?: string; marcAt?: Position } = {}) {
  const mine = async (firstName: string, phone: string) => (await seedPerson(db, eventId, { firstName, phone }, token)).id;
  const device = { marc: await mine("Marc", PHONES.marc), lea: await mine("Léa", PHONES.lea), tom: await mine("Tom", PHONES.tom) };
  const other = async (firstName: string, of?: string) => (await seedPerson(db, eventId, { firstName }, of)).id;
  const others = { claire: await other("Claire"), sophie: await other("Sophie"), ines: await other("Inès", inesToken), hugo: await other("Hugo") };
  const cars = {
    marc: await seedRide(db, eventId, device.marc, { seats: 3, departureTime: "08:00:00", position: marcAt ?? null }),
    claire: await seedRide(db, eventId, others.claire, { seats: 2, departureTime: "08:15:00" }),
    sophie: await seedRide(db, eventId, others.sophie, { leg: "retour", seats: 3 }),
  };
  const place = (personId: string, leg: Leg, rideId: string | null) => seedPlacement(db, { personId, eventId, leg, rideId });
  await place(others.ines, "aller", cars.marc);
  await place(others.hugo, "aller", cars.marc);
  await place(device.lea, "aller", cars.marc);
  await place(others.sophie, "aller", cars.claire);
  await place(device.tom, "aller", null);
  await place(device.marc, "retour", cars.sophie);
  await place(device.lea, "retour", null);
  await place(others.ines, "retour", null);
  await place(others.hugo, "retour", null);
  return { device, others, cars };
}
