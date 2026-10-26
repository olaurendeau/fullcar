import { randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import { PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import type { Database } from "./schema";
import { seedEvent } from "./test-events";
import { seedPerson, seedPlacement, seedRide, type SeededPerson } from "./test-participants";

/** The eight persons of the example; `doublon` is the second Léa, signed up from the tablet. */
export const EXAMPLE_PERSONS = ["claire", "hugo", "ines", "lea", "doublon", "marc", "sophie", "tom"] as const;
export type ExamplePerson = (typeof EXAMPLE_PERSONS)[number];

const FIRST_NAMES: Record<ExamplePerson, string> = {
  claire: "Claire",
  hugo: "Hugo",
  ines: "Inès",
  lea: "Léa",
  doublon: "Léa",
  marc: "Marc",
  sophie: "Sophie",
  tom: "Tom",
};

/** The device of the Martins holds Marc, Léa and Tom; every other person has her own. */
const MARTINS: readonly ExamplePerson[] = ["marc", "lea", "tom"];

export interface RemovalExample {
  eventId: string;
  /** The organiser's token, for tests only: the database keeps its hash. */
  adminToken: string;
  /** The personal token of the Martins' device, for tests only. */
  martins: string;
  persons: Record<ExamplePerson, SeededPerson>;
  rides: { claireAller: string; marcAller: string; claireRetour: string; sophieRetour: string };
}

/**
 * The « Tournoi de Rennes » of remove-person v2 (« L'exemple, et ses nombres »), every number
 * of its mock-ups derived from it. For Vitest and the Playwright fixtures.
 *
 * | person  | aller                         | retour                       |
 * |---------|-------------------------------|------------------------------|
 * | Claire  | drives (2 seats): Sophie      | drives (2 seats): nobody     |
 * | Hugo    | with Marc                     | not concerned                |
 * | Inès    | with Marc                     | without a car                |
 * | Léa     | with Marc                     | without a car                |
 * | doublon | without a car                 | without a car                |
 * | Marc    | drives (3 seats): Léa, Inès, Hugo | with Sophie              |
 * | Sophie  | with Claire                   | drives (3 seats): Marc       |
 * | Tom     | without a car                 | not concerned                |
 *
 * Aller: 2 without a car, 1 free seat. Retour: 3 without a car, 4 free seats.
 */
export async function seedRemovalExample(db: Kysely<Database>): Promise<RemovalExample> {
  const { id: eventId, token: adminToken } = await seedEvent(db);
  const martins = personalTokenFromBytes(randomBytes(PERSONAL_TOKEN_BYTES));
  const persons = {} as Record<ExamplePerson, SeededPerson>;
  for (const name of EXAMPLE_PERSONS) {
    const token = MARTINS.includes(name) ? martins : undefined;
    persons[name] = await seedPerson(db, eventId, { firstName: FIRST_NAMES[name] }, token);
  }
  const { claire, hugo, ines, lea, doublon, marc, sophie, tom } = persons;
  const rides = {
    claireAller: await seedRide(db, eventId, claire.id, { leg: "aller", seats: 2 }),
    marcAller: await seedRide(db, eventId, marc.id, { leg: "aller", seats: 3 }),
    claireRetour: await seedRide(db, eventId, claire.id, { leg: "retour", seats: 2, departureTime: "18:00:00" }),
    sophieRetour: await seedRide(db, eventId, sophie.id, { leg: "retour", seats: 3, departureTime: "18:15:00" }),
  };
  const place = (person: SeededPerson, leg: "aller" | "retour", rideId: string | null) =>
    seedPlacement(db, { personId: person.id, eventId, leg, rideId });
  await place(sophie, "aller", rides.claireAller);
  await place(lea, "aller", rides.marcAller);
  await place(ines, "aller", rides.marcAller);
  await place(hugo, "aller", rides.marcAller);
  await place(doublon, "aller", null);
  await place(tom, "aller", null);
  await place(marc, "retour", rides.sophieRetour);
  await place(ines, "retour", null);
  await place(lea, "retour", null);
  await place(doublon, "retour", null);
  return { eventId, adminToken, martins, persons, rides };
}
