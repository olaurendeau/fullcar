import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findEventById, writeEventFields } from "@/db/events";
import { countLegRows, type LegCounts } from "@/db/legs";
import { readTokenHolders } from "@/db/persons";
import type { Database } from "@/db/schema";
import { whileHeld, withCommittedEvent } from "@/db/test-committed";
import { withRollback } from "@/db/test-db";
import { removeSeededRetour, seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { hashAdminToken, newAdminToken } from "@/domain/admin-token";
import { eventFieldsOf, serverBounds, validateEventChange, type EventHeader } from "@/domain/event";
import { editEvent } from "./edit-event";
import { offerRide } from "./offer-ride";
import { takeSeats } from "./seats";

type Db = Kysely<Database>;

/** The UTC date the server reads: its bounds run from 2026-10-20 to 2027-10-22. */
const NOW = new Date("2026-10-21T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/** What the page loaded: the event `seedEvent` stores. */
const BEFORE: EventHeader = {
  title: "Tournoi de Rennes",
  location: "Gymnase des Gayeulles",
  allerAt: "2026-12-12 07:30:00",
  retourAt: "2026-12-12 18:00:00",
};

/** The form as it opens on BEFORE. */
const FORM = {
  title: BEFORE.title,
  location: BEFORE.location,
  allerDate: "2026-12-12",
  allerTime: "07:30",
  retour: true,
  retourDate: "2026-12-12",
  retourTime: "18:00",
};

const WITHOUT_RETOUR = { ...FORM, retour: false };

/** Whether `answer`, as the browser receives it, carries `secret`: never printed, whatever the outcome. */
function carries(answer: unknown, secret: string): boolean {
  return JSON.stringify(answer).includes(secret);
}

/** The event's row and everything hanging off it: what « nothing is written » compares. */
async function rowsOf(db: Db, eventId: string) {
  const event = await findEventById(db, eventId);
  const rides = await db
    .selectFrom("ride")
    .select(["id", "leg", "departure_time"])
    .where("event_id", "=", eventId)
    .orderBy("id")
    .execute();
  const placements = await db
    .selectFrom("placement")
    .select(["person_id", "leg", "ride_id"])
    .where("event_id", "=", eventId)
    .orderBy("person_id")
    .orderBy("leg")
    .execute();
  const persons = (await readTokenHolders(db, eventId)).map((holder) => holder.id).sort();
  return { event, rides, placements, persons };
}

/**
 * Aller: Marc drives Léa, Tom is without a car. Retour: Marc drives Léa, Zoé drives nobody,
 * Inès, who only does the retour, is without a car. The retour counts 2 cars and 4 persons.
 */
async function seedScene(db: Db, eventId: string) {
  const marc = await seedPerson(db, eventId, { firstName: "Marc" });
  const lea = await seedPerson(db, eventId, { firstName: "Léa" });
  const tom = await seedPerson(db, eventId, { firstName: "Tom" });
  const zoe = await seedPerson(db, eventId, { firstName: "Zoé" });
  const ines = await seedPerson(db, eventId, { firstName: "Inès" });
  const aller = await seedRide(db, eventId, marc.id, { leg: "aller", departureTime: "07:15:00" });
  const retour = await seedRide(db, eventId, marc.id, { leg: "retour", departureTime: "18:30:00" });
  await seedRide(db, eventId, zoe.id, { leg: "retour", departureTime: "18:45:00" });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "aller", rideId: aller });
  await seedPlacement(db, { personId: tom.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: lea.id, eventId, leg: "retour", rideId: retour });
  await seedPlacement(db, { personId: ines.id, eventId, leg: "retour", rideId: null });
  return { marc, lea, tom, zoe, ines, aller, retour };
}

const SEEN: LegCounts = { cars: 2, persons: 4 };

/** In a rolled-back transaction: the event seeded with `seed`, then edited by `edit`. */
function onSeeded<T>(edit: (trx: Db, eventId: string, token: string) => Promise<T>, seed = {}) {
  return withRollback(async (trx) => {
    const { id, token } = await seedEvent(trx, seed);
    return edit(trx, id, token);
  });
}

describe("editEvent", () => {
  describe("M2.1", () => {
    it("writes the title, the location and the start, answers them, and leaves the options as they were", async () => {
      await onSeeded(
        async (trx, eventId, token) => {
          const before = await findEventById(trx, eventId);
          const fields = { ...FORM, title: "Tournoi de Rennes U13", location: "Salle Carrel", allerTime: "14:00" };
          const answer = await editEvent(trx, eventId, token, { ...fields, boosters: false, stops: true }, BEFORE);

          const event = { ...BEFORE, title: "Tournoi de Rennes U13", location: "Salle Carrel", allerAt: "2026-12-12 14:00:00" };
          expect(answer).toEqual({ ok: true, event });
          expect(await findEventById(trx, eventId)).toEqual({
            ...before,
            title: event.title,
            location: event.location,
            aller_at: event.allerAt,
          });
        },
        { boostersEnabled: true, participationEnabled: true },
      );
    });
  });

  describe("M2.3: the action refuses the forged fields the form refuses, with the same keys", () => {
    it.each<[string, unknown, Record<string, string>]>([
      ["an empty title", { ...FORM, title: "" }, { title: "required" }],
      ["a title of 81 characters", { ...FORM, title: "a".repeat(81) }, { title: "tooLong" }],
      ["an end an hour before the start, the same day", { ...FORM, retourTime: "06:30" }, { retourTime: "notAfterAller" }],
      ["an end a day before", { ...FORM, retourDate: "2026-12-11" }, { retourDate: "notAfterAller" }],
      ["a title that is not text", { ...FORM, title: 42 }, { title: "required" }],
      ["a start moved beyond a year", { ...FORM, allerDate: "2027-10-23" }, { allerDate: "tooLate" }],
      [
        "fields that are not an object",
        "title",
        { title: "required", location: "required", allerDate: "required", allerTime: "required" },
      ],
    ])("%s, and writes nothing", async (_, fields, expected) => {
      await onSeeded(async (trx, eventId, token) => {
        const before = await rowsOf(trx, eventId);
        const answer = await editEvent(trx, eventId, token, fields, BEFORE);
        expect(answer).toEqual({ ok: false, errors: expected });
        const form = validateEventChange(eventFieldsOf(fields), serverBounds(NOW), BEFORE);
        expect(answer).toEqual(form);
        expect(await rowsOf(trx, eventId)).toEqual(before);
      });
    });
  });

  describe("M2.4: a date kept as it was escapes both bounds", () => {
    it.each([
      ["a start and an end already past", "2026-10-19"],
      ["a start and an end beyond the server's year", "2027-10-25"],
    ])("accepts %s, kept, with another title", async (_, date) => {
      const saved = { ...BEFORE, allerAt: `${date} 07:30:00`, retourAt: `${date} 18:00:00` };
      const fields = { ...FORM, title: "Tournoi de Rennes U13", allerDate: date, retourDate: date };
      const answer = await onSeeded((trx, eventId, token) => editEvent(trx, eventId, token, fields, saved), saved);
      expect(answer).toEqual({ ok: true, event: { ...saved, title: "Tournoi de Rennes U13" } });
    });
  });

  describe("the shape of `before` and of `removal`, checked before the fields", () => {
    it.each<[string, unknown]>([
      ["missing", undefined],
      ["null", null],
      ["text", "Tournoi de Rennes"],
      ["without a title", { ...BEFORE, title: undefined }],
      ["with a location that is not text", { ...BEFORE, location: 42 }],
      ["with a start in another shape", { ...BEFORE, allerAt: "2026-12-12T07:30:00" }],
      ["with an end that is only a date", { ...BEFORE, retourAt: "2026-12-12" }],
      ["with an end missing rather than null", { ...BEFORE, retourAt: undefined }],
    ])("answers invalid for a before %s, even with a field refused, and writes nothing", async (_, before) => {
      await onSeeded(async (trx, eventId, token) => {
        const rows = await rowsOf(trx, eventId);
        expect(await editEvent(trx, eventId, token, FORM, before)).toEqual({ ok: false, error: "invalid" });
        expect(await editEvent(trx, eventId, token, { ...FORM, title: "" }, before)).toEqual({
          ok: false,
          error: "invalid",
        });
        expect(await rowsOf(trx, eventId)).toEqual(rows);
      });
    });

    it.each<[string, unknown]>([
      ["null", null],
      ["text", "2 4"],
      ["without persons", { cars: 2 }],
      ["with numbers as text", { cars: "2", persons: "4" }],
      ["with a negative number", { cars: -1, persons: 4 }],
      ["with a fraction", { cars: 2, persons: 3.5 }],
      ["an array", [2, 4]],
    ])("answers invalid for a removal %s, and writes nothing", async (_, removal) => {
      await withRollback(async (trx) => {
        const { id: eventId, token } = await seedEvent(trx);
        await seedScene(trx, eventId);
        const rows = await rowsOf(trx, eventId);
        expect(await editEvent(trx, eventId, token, WITHOUT_RETOUR, BEFORE, removal)).toEqual({
          ok: false,
          error: "invalid",
        });
        expect(await rowsOf(trx, eventId)).toEqual(rows);
      });
    });
  });

  describe("M3.4, M3.5: the retour unchecked", () => {
    it("M3.4: with the numbers confirmed, deletes the retour's Rides and Placements, keeps the persons and the aller", async () => {
      await withRollback(async (trx) => {
        const { id: eventId, token } = await seedEvent(trx);
        const { ines } = await seedScene(trx, eventId);
        const before = await rowsOf(trx, eventId);
        const fields = { ...WITHOUT_RETOUR, title: "Tournoi de Rennes U13" };

        const answer = await editEvent(trx, eventId, token, fields, BEFORE, SEEN);

        const event = { ...BEFORE, title: "Tournoi de Rennes U13", retourAt: null };
        expect(answer).toEqual({ ok: true, event });
        const after = await rowsOf(trx, eventId);
        expect(after).toEqual({
          event: { ...before.event, title: event.title, retour_at: null },
          rides: before.rides.filter((ride) => ride.leg === "aller"),
          placements: before.placements.filter((placement) => placement.leg === "aller"),
          persons: before.persons,
        });
        // Inès, who only did the retour, has no Placement left.
        expect(after.placements.some((placement) => placement.person_id === ines.id)).toBe(false);
      });
    });

    it.each<[string, LegCounts | undefined]>([
      ["unconfirmed", undefined],
      ["confirmed with other numbers", { cars: 1, persons: 3 }],
    ])("M3.5: %s, answers confirmRetour with the numbers now, and writes nothing, the title neither", async (_, removal) => {
      await withRollback(async (trx) => {
        const { id: eventId, token } = await seedEvent(trx);
        await seedScene(trx, eventId);
        const before = await rowsOf(trx, eventId);
        const fields = { ...WITHOUT_RETOUR, title: "Tournoi de Rennes U13" };

        expect(await editEvent(trx, eventId, token, fields, BEFORE, removal)).toEqual({
          ok: false,
          error: "confirmRetour",
          ...SEEN,
        });
        expect(await rowsOf(trx, eventId)).toEqual(before);
      });
    });

    it("an empty retour is removed without a confirmation", async () => {
      await onSeeded(async (trx, eventId, token) => {
        await seedPerson(trx, eventId);
        expect(await editEvent(trx, eventId, token, WITHOUT_RETOUR, BEFORE)).toEqual({
          ok: true,
          event: { ...BEFORE, retourAt: null },
        });
        expect((await findEventById(trx, eventId))?.retour_at).toBeNull();
      });
    });

    it("numbers sent with the retour kept delete nothing", async () => {
      await withRollback(async (trx) => {
        const { id: eventId, token } = await seedEvent(trx);
        await seedScene(trx, eventId);
        expect(await editEvent(trx, eventId, token, FORM, BEFORE, SEEN)).toEqual({ ok: true, event: BEFORE });
        expect(await countLegRows(trx, eventId, "retour")).toEqual(SEEN);
      });
    });
  });

  it("M5.2: a start and an end moved to the next day leave every departure time as it was", async () => {
    await withRollback(async (trx) => {
      const { id: eventId, token } = await seedEvent(trx);
      await seedScene(trx, eventId);
      const before = await rowsOf(trx, eventId);
      const fields = { ...FORM, allerDate: "2026-12-13", retourDate: "2026-12-13" };

      expect(await editEvent(trx, eventId, token, fields, BEFORE)).toMatchObject({ ok: true });

      const after = await rowsOf(trx, eventId);
      expect(after.event).toMatchObject({ aller_at: "2026-12-13 07:30:00", retour_at: "2026-12-13 18:00:00" });
      expect(after.rides).toEqual(before.rides);
    });
  });

  describe("M6.1, M6.2: `before` no longer true", () => {
    it.each<[string, Partial<EventHeader>]>([
      ["the title", { title: "Tournoi de Rennes U13" }],
      ["the location", { location: "Salle Carrel" }],
      ["the start", { allerAt: "2026-12-12 08:00:00" }],
      ["the end", { retourAt: "2026-12-12 19:00:00" }],
    ])("M6.1: %s changed on another device: changed, with what is stored, and nothing written", async (_, other) => {
      await onSeeded(async (trx, eventId, token) => {
        const stored = { ...BEFORE, ...other };
        await writeEventFields(trx, eventId, stored);
        const rows = await rowsOf(trx, eventId);
        const fields = { ...FORM, location: "Salle B" };

        const answer = await editEvent(trx, eventId, token, fields, BEFORE);

        expect(answer).toEqual({ ok: false, error: "changed", event: stored });
        expect(await rowsOf(trx, eventId)).toEqual(rows);
        // Sent again from what is stored, it is written.
        const again = { ...fields, title: stored.title };
        expect(await editEvent(trx, eventId, token, again, stored)).toEqual({
          ok: true,
          event: { ...BEFORE, title: stored.title, location: "Salle B" },
        });
      });
    });

    it("M6.2: the retour removed on another device: changed without a retour; sent again, it stays removed", async () => {
      await onSeeded(async (trx, eventId, token) => {
        await removeSeededRetour(trx, eventId);
        const fields = { ...FORM, title: "Tournoi de Rennes U13" };

        const answer = await editEvent(trx, eventId, token, fields, BEFORE);

        const stored = { ...BEFORE, retourAt: null };
        expect(answer).toEqual({ ok: false, error: "changed", event: stored });
        expect(await findEventById(trx, eventId)).toMatchObject({ title: BEFORE.title, retour_at: null });
        expect(await editEvent(trx, eventId, token, { ...fields, retour: false }, stored)).toEqual({
          ok: true,
          event: { ...stored, title: "Tournoi de Rennes U13" },
        });
        expect((await findEventById(trx, eventId))?.retour_at).toBeNull();
      });
    });

    it("M6.2: a retour added on another device: changed with it, and nothing removed", async () => {
      await onSeeded(
        async (trx, eventId, token) => {
          await writeEventFields(trx, eventId, BEFORE);
          const answer = await editEvent(trx, eventId, token, WITHOUT_RETOUR, { ...BEFORE, retourAt: null });
          expect(answer).toEqual({ ok: false, error: "changed", event: BEFORE });
          expect((await findEventById(trx, eventId))?.retour_at).toBe(BEFORE.retourAt);
        },
        { retourAt: null },
      );
    });
  });

  describe("M8.2: the organiser's token", () => {
    it.each<[string, (token: string) => unknown]>([
      ["missing", () => undefined],
      ["empty", () => ""],
      ["another one", () => newAdminToken()],
      ["one character off", (token) => `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`],
      ["one character short", (token) => token.slice(0, -1)],
      ["its hash", (token) => hashAdminToken(token)],
      ["a number", () => 42],
      ["wrapped in an array", (token) => [token]],
    ])("answers invalid for a token %s, before the fields, and writes nothing", async (_, forge) => {
      await onSeeded(async (trx, eventId, token) => {
        const rows = await rowsOf(trx, eventId);
        const fields = { ...FORM, title: "Tournoi de Rennes U13" };
        expect(await editEvent(trx, eventId, forge(token), fields, BEFORE)).toEqual({ ok: false, error: "invalid" });
        expect(await editEvent(trx, eventId, forge(token), { ...fields, title: "" }, BEFORE)).toEqual({
          ok: false,
          error: "invalid",
        });
        expect(await rowsOf(trx, eventId)).toEqual(rows);
      });
    });

    it("answers invalid for the token of another event, and writes nothing", async () => {
      await withRollback(async (trx) => {
        const first = await seedEvent(trx);
        const second = await seedEvent(trx);
        const rows = await rowsOf(trx, first.id);
        expect(await editEvent(trx, first.id, second.token, { ...FORM, title: "U13" }, BEFORE)).toEqual({
          ok: false,
          error: "invalid",
        });
        expect(await rowsOf(trx, first.id)).toEqual(rows);
      });
    });

    it("never puts the token, nor its hash, in an answer", async () => {
      await withRollback(async (trx) => {
        const { id: eventId, token } = await seedEvent(trx);
        await seedScene(trx, eventId);
        const answers = [
          await editEvent(trx, eventId, token, { ...FORM, title: "" }, BEFORE),
          await editEvent(trx, eventId, token, FORM, { ...BEFORE, title: "Autre" }),
          await editEvent(trx, eventId, token, WITHOUT_RETOUR, BEFORE),
          await editEvent(trx, eventId, token, FORM, "x"),
          await editEvent(trx, "Zz9yXw8v", token, FORM, BEFORE),
          await editEvent(trx, eventId, token, WITHOUT_RETOUR, BEFORE, SEEN),
        ];
        expect(answers.map((answer) => ("error" in answer ? answer.error : answer.ok))).toEqual([
          false,
          "changed",
          "confirmRetour",
          "invalid",
          "eventNotFound",
          true,
        ]);
        for (const answer of answers) {
          expect(carries(answer, token)).toBe(false);
          expect(carries(answer, hashAdminToken(token))).toBe(false);
        }
      });
    });
  });

  describe("M8.3: an event that is not there", () => {
    it("answers eventNotFound for an unknown id, or an event deleted since the page loaded", async () => {
      await withRollback(async (trx) => {
        const { id, token } = await seedEvent(trx);
        expect(await editEvent(trx, "Zz9yXw8v", token, FORM, BEFORE)).toEqual({ ok: false, error: "eventNotFound" });
        await trx.deleteFrom("event").where("id", "=", id).execute();
        expect(await editEvent(trx, id, token, FORM, BEFORE)).toEqual({ ok: false, error: "eventNotFound" });
      });
    });

    it("answers eventNotFound for a malformed id, without reading the database", async () => {
      const unreachable = new Proxy({} as Db, {
        get() {
          throw new Error("the database was read");
        },
      });
      for (const id of ["Ab3dEf7", "' or 1=1", "Ab3dEf7l"]) {
        expect(await editEvent(unreachable, id, newAdminToken(), FORM, BEFORE)).toEqual({
          ok: false,
          error: "eventNotFound",
        });
      }
    });

    it("answers eventNotFound for an event deleted while the change waited for its lock (committed data)", async () => {
      await withCommittedEvent(async (db, eventId, token) => {
        const answer = await whileHeld(
          db,
          (trx) => trx.deleteFrom("event").where("id", "=", eventId).execute(),
          () => editEvent(db, eventId, token, { ...FORM, title: "Tournoi de Rennes U13" }, BEFORE),
        );
        expect(answer).toEqual({ ok: false, error: "eventNotFound" });
      });
    });
  });
});

type Scene = Awaited<ReturnType<typeof seedScene>>;

/** A write on the retour by Tom, and what it makes of the retour's numbers. */
const WRITES: [string, LegCounts, (db: Db, eventId: string, scene: Scene) => Promise<unknown>][] = [
  [
    "a seat taken on the retour",
    { cars: 2, persons: 5 },
    (db, eventId, { tom, retour }) => takeSeats(db, eventId, tom.token, retour, "retour", [tom.id]),
  ],
  [
    "a car offered on the retour",
    { cars: 3, persons: 5 },
    (db, eventId, { tom }) =>
      offerRide(db, eventId, tom.token, {
        rideId: randomUUID(),
        leg: "retour",
        driver: { kind: "device", personId: tom.id },
        location: "Salle Paul Bert",
        time: "18:30",
        seats: "3",
        note: "",
      }),
  ],
];

/**
 * M3.6 through the change itself: given the connection, it removes the retour in its own
 * READ COMMITTED transaction, which counts the retour again after the Event's lock.
 */
describe("M3.6: editEvent removing the retour while a write on the retour runs, on committed data", () => {
  it.each(WRITES)("%s first: the change waits for it, then answers confirmRetour with the new numbers", async (_, after, write) => {
    await withCommittedEvent(async (db, eventId, token) => {
      const scene = await seedScene(db, eventId);

      const answer = await whileHeld(
        db,
        (trx) => write(trx, eventId, scene),
        () => editEvent(db, eventId, token, WITHOUT_RETOUR, BEFORE, SEEN),
      );

      expect(answer).toEqual({ ok: false, error: "confirmRetour", ...after });
      expect((await findEventById(db, eventId))?.retour_at).toBe(BEFORE.retourAt);
      expect(await countLegRows(db, eventId, "retour")).toEqual(after);
    });
  });

  it.each(WRITES)("the change first: %s waits for it, then is refused by noRetour", async (_, __, write) => {
    await withCommittedEvent(async (db, eventId, token) => {
      const scene = await seedScene(db, eventId);

      const written = await whileHeld(
        db,
        (trx) => editEvent(trx, eventId, token, WITHOUT_RETOUR, BEFORE, SEEN),
        () => write(db, eventId, scene),
      );

      expect(written).toMatchObject({ ok: false, error: "noRetour" });
      expect((await findEventById(db, eventId))?.retour_at).toBeNull();
      expect(await countLegRows(db, eventId, "retour")).toEqual({ cars: 0, persons: 0 });
    });
  });
});
