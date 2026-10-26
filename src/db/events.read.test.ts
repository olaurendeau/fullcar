import { describe, expect, it } from "vitest";
import { hashAdminToken } from "@/domain/admin-token";
import type { NewEvent } from "@/domain/event";
import { findEventById, insertEvent } from "./events";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";

/** What anyone with the public link may read: no hash, no bookkeeping. */
const PUBLIC_FIELDS = [
  "id",
  "title",
  "location",
  "location_lat",
  "location_lng",
  "aller_at",
  "retour_at",
  "description",
  "boosters_enabled",
  "participation_enabled",
  "stops_enabled",
];

const EVENT: NewEvent = {
  title: "Tournoi de Rennes",
  location: "Gymnase des Gayeulles",
  allerAt: "2026-12-12 07:30:00",
  retourAt: null,
  locationPosition: null,
  description: null,
  boostersEnabled: false,
  participationEnabled: false,
  stopsEnabled: false,
};

describe("findEventById", () => {
  it("gives back the event stored under the id", async () => {
    const { id, found } = await withRollback(async (trx) => {
      const { id } = await seedEvent(trx, { boostersEnabled: true, stopsEnabled: true });
      return { id, found: await findEventById(trx, id) };
    });
    expect(found).toEqual({
      id,
      title: "Tournoi de Rennes",
      location: "Gymnase des Gayeulles",
      aller_at: "2026-12-12 07:30:00",
      retour_at: "2026-12-12 18:00:00",
      location_lat: null,
      location_lng: null,
      description: null,
      boosters_enabled: true,
      participation_enabled: false,
      stops_enabled: true,
    });
  });

  // D5: the position is shown to anyone holding the link, as the location is.
  it("gives back the position of the location", async () => {
    const found = await withRollback(async (trx) => {
      const { id } = await seedEvent(trx, { locationPosition: { lat: 48.1173, lng: -1.67779 } });
      return findEventById(trx, id);
    });
    expect(found).toMatchObject({ location_lat: 48.1173, location_lng: -1.67779 });
  });

  it("gives back exactly the public fields, never the token hash", async () => {
    const found = await withRollback(async (trx) => {
      const { id } = await seedEvent(trx);
      return findEventById(trx, id);
    });
    expect(Object.keys(found ?? {}).sort()).toEqual([...PUBLIC_FIELDS].sort());
  });

  it("gives a null retour_at for an event without retour", async () => {
    const found = await withRollback(async (trx) => {
      const { id } = await seedEvent(trx, { retourAt: null });
      return findEventById(trx, id);
    });
    expect(found?.retour_at).toBeNull();
  });

  it("gives nothing for an unknown id", async () => {
    const found = await withRollback(async (trx) => {
      await seedEvent(trx);
      return findEventById(trx, "Zz9yXw8v");
    });
    expect(found).toBeUndefined();
  });

  // A fixed id: a drawn one may hold no letter to change the case of.
  it("C6.2: gives nothing for a known id with one letter in another case", async () => {
    const found = await withRollback(async (trx) => {
      await insertEvent(trx, EVENT, hashAdminToken("not a real token"), () => "Ab3dEf7h");
      return { known: await findEventById(trx, "Ab3dEf7h"), otherCase: await findEventById(trx, "ab3dEf7h") };
    });
    expect(found.known?.id).toBe("Ab3dEf7h");
    expect(found.otherCase).toBeUndefined();
  });
});
