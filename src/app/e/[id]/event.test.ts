import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { findPublicEvent, headerFrom } from "./event";

/** A connection that fails the test as soon as anything reaches for it. */
const untouchable = new Proxy({} as Kysely<Database>, {
  get(_, property) {
    throw new Error(`the database was used (${String(property)})`);
  },
});

describe("findPublicEvent", () => {
  // C6.2: a malformed id is a 404 without reading the database.
  for (const [what, id] of [
    ["7 symbols", "Ab3dEf7"],
    ["9 symbols", "Ab3dEf7hj"],
    ["a 0", "Ab3dEf70"],
    ["an O", "Ab3dEf7O"],
    ["a 1", "Ab3dEf71"],
    ["an l", "Ab3dEf7l"],
    ["an I", "Ab3dEf7I"],
    ["a space", "Ab3d f7h"],
    ["an empty id", ""],
  ]) {
    it(`gives nothing for ${what}, without reading the database`, async () => {
      await expect(findPublicEvent(untouchable, id)).resolves.toBeUndefined();
    });
  }

  it("gives the public fields of a stored event", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx, { retourAt: null });
      expect(await findPublicEvent(trx, id)).toEqual({
        id,
        title: "Tournoi de Rennes",
        location: "Gymnase des Gayeulles",
        aller_at: "2026-12-12 07:30:00",
        retour_at: null,
        location_lat: null,
        location_lng: null,
        description: null,
        boosters_enabled: false,
        participation_enabled: false,
        stops_enabled: false,
        anonymised_at: null,
      });
    });
  });

  it("gives nothing for a well-formed id that is not stored", async () => {
    await withRollback(async (trx) => {
      await seedEvent(trx);
      expect(await findPublicEvent(trx, "Zz9yXw8v")).toBeUndefined();
    });
  });
});

describe("headerFrom", () => {
  it("carries the description stored, or null without one", async () => {
    await withRollback(async (trx) => {
      const { id } = await seedEvent(trx, { description: "Rendez-vous à 7 h\nDevant le gymnase" });
      const { id: bare } = await seedEvent(trx);
      expect(headerFrom((await findPublicEvent(trx, id))!).description).toBe("Rendez-vous à 7 h\nDevant le gymnase");
      expect(headerFrom((await findPublicEvent(trx, bare))!).description).toBeNull();
    });
  });
});
