import { sql, type Kysely } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { updatePerson } from "@/db/persons";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { anAddress, seedAccount, seedSession } from "@/db/test-accounts";
import { withRollback } from "@/db/test-db";
import { confirmSeededEvent, seedEvent, seedPendingSend } from "@/db/test-events";
import { seedPerson, seedPlacement, seedRide } from "@/db/test-participants";
import { atomically } from "@/db/transaction";
import type { Leg } from "@/domain/leg";
import { legIsEmpty, organiserPersons, type OrganiserPanelAnswer } from "@/domain/organiser-panel";
import type { Brevo } from "@/email/brevo";
import { createEventFor } from "@/app/create-event";
import { readOrganiserState } from "./organiser-state";

// The same function, watched: the persons are built after the access check, not before.
vi.mock("@/domain/organiser-panel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/organiser-panel")>();
  return { ...actual, organiserPersons: vi.fn(actual.organiserPersons) };
});

type Db = Kysely<Database>;

/** A connection that fails the test as soon as anything reaches for it. */
const untouchable = new Proxy({} as Db, {
  get(_, property) {
    throw new Error(`the database was used (${String(property)})`);
  },
});

const PHONES = {
  a: "06 11 11 11 11",
  b: "06 22 22 22 22",
  c: "07 33 33 33 33",
  e: "+33 6 55 55 55 55",
} as const;
type Name = keyof typeof PHONES;

/**
 * O2.5: everybody has a number but D.
 * Aller: A drives B and E; C, then D, are without a car.
 * Retour: B is without a car; A, C, D and E are not concerned.
 */
async function seedScene(db: Db) {
  const event = await seedEvent(db);
  const eventId = event.id;
  const a = await seedPerson(db, eventId, { firstName: "A", phone: PHONES.a });
  const b = await seedPerson(db, eventId, { firstName: "B", phone: PHONES.b });
  const c = await seedPerson(db, eventId, { firstName: "C", phone: PHONES.c });
  const d = await seedPerson(db, eventId, { firstName: "D", phone: null });
  const e = await seedPerson(db, eventId, { firstName: "E", phone: PHONES.e });
  const ride = await seedRide(db, eventId, a.id, { leg: "aller", seats: 3 });
  await seedPlacement(db, { personId: b.id, eventId, leg: "aller", rideId: ride });
  await seedPlacement(db, { personId: e.id, eventId, leg: "aller", rideId: ride });
  await seedPlacement(db, { personId: c.id, eventId, leg: "aller", rideId: null });
  await seedPlacement(db, { personId: d.id, eventId, leg: "aller", rideId: null });
  // now() is the transaction's: D declares a second after C, so that the order is theirs.
  await db
    .updateTable("placement")
    .set({ placed_at: sql<Date>`now() + interval '1 second'` })
    .where("person_id", "=", d.id)
    .execute();
  await seedPlacement(db, { personId: b.id, eventId, leg: "retour", rideId: null });
  return { eventId, token: event.token, a, b, c, d, e, ride };
}

function oneCharOff(token: string): string {
  return `${token.slice(0, -1)}${token.at(-1) === "A" ? "B" : "A"}`;
}

function digits(text: string): string {
  return text.replace(/\D/g, "");
}

/** Whose digits appear anywhere in the answer, once serialized as the action's result is. */
function sentNumbers(answer: unknown): Name[] {
  const sent = digits(JSON.stringify(answer) ?? "");
  return (Object.keys(PHONES) as Name[]).filter((name) => sent.includes(digits(PHONES[name])));
}

function legOf(answer: OrganiserPanelAnswer, leg: Leg) {
  if (answer.state !== "panel") throw new Error(`the answer is ${answer.state}`);
  const found = answer.legs.find((candidate) => candidate.leg === leg);
  if (found === undefined) throw new Error(`no ${leg} in the answer`);
  return found;
}

describe("readOrganiserState", () => {
  it("O2.5, O3.4: with the right token, the numbers of the persons without a car, on their leg only", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const answer = await readOrganiserState(trx, scene.eventId, { adminToken: scene.token });
      expect(answer).toStrictEqual({
        state: "panel",
        legs: [
          {
            leg: "aller",
            coverage: { withoutCar: 2, freeSeats: 1 },
            carCount: 1,
            withoutCar: [
              { id: scene.c.id, firstName: "C", phone: PHONES.c },
              { id: scene.d.id, firstName: "D", phone: null },
            ],
            // A has a number: their car is counted, never listed.
            carsWithoutPhone: [],
          },
          {
            leg: "retour",
            coverage: { withoutCar: 1, freeSeats: 0 },
            carCount: 0,
            withoutCar: [{ id: scene.b.id, firstName: "B", phone: PHONES.b }],
            carsWithoutPhone: [],
          },
        ],
        // Their content is RP4.2's, below.
        persons: expect.any(Array),
      });
      expect(sentNumbers(answer)).toEqual(["b", "c"]);
      expect(sentNumbers(answer.state === "panel" && answer.persons)).toEqual([]);
    });
  });

  it("RP4.2: every person, in the event's order, with a cell per leg and no number", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      // An order of sign-up that is neither the names' nor the ids'.
      const order = [scene.d, scene.b, scene.e, scene.a, scene.c];
      for (const [n, { id }] of order.entries()) {
        await sql`update person set created_at = ${new Date(Date.UTC(2026, 9, 1, 8, n))} where id = ${id}`.execute(trx);
      }
      const answer = await readOrganiserState(trx, scene.eventId, { adminToken: scene.token });
      const withA = { kind: "passenger", rideId: scene.ride, driver: { id: scene.a.id, firstName: "A" } };
      const withoutCar = { kind: "withoutCar" };
      const notConcerned = { kind: "notConcerned" };
      const cells = (aller: object, retour: object) => [
        { leg: "aller", state: aller },
        { leg: "retour", state: retour },
      ];
      expect(answer.state === "panel" && answer.persons).toStrictEqual([
        { id: scene.d.id, firstName: "D", cells: cells(withoutCar, notConcerned) },
        { id: scene.b.id, firstName: "B", cells: cells(withA, withoutCar) },
        { id: scene.e.id, firstName: "E", cells: cells(withA, notConcerned) },
        { id: scene.a.id, firstName: "A", cells: cells({ kind: "driver", rideId: scene.ride }, notConcerned) },
        { id: scene.c.id, firstName: "C", cells: cells(withoutCar, notConcerned) },
      ]);
    });
  });

  it("RP4.2: an event without a retour and without anybody has nobody to list", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx, { retourAt: null });
      const answer = await readOrganiserState(trx, id, { adminToken: token });
      expect(answer.state === "panel" && answer.persons).toStrictEqual([]);
    });
  });

  it.each([
    ["once with the right token", (token: string) => token, 1],
    ["never with a token one character off", oneCharOff, 0],
    ["never without a token", () => undefined, 0],
  ])("builds the persons after the access check only: %s", async (_, tokenOf, times) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      vi.mocked(organiserPersons).mockClear();
      await readOrganiserState(trx, scene.eventId, { adminToken: tokenOf(scene.token) });
      expect(organiserPersons).toHaveBeenCalledTimes(times);
    });
  });

  it("OA7.6: the organiser's session reads the very panel the creation browser's token reads", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const session = await seedSession(trx, await confirmSeededEvent(trx, scene.eventId));
      const byToken = await readOrganiserState(trx, scene.eventId, { adminToken: scene.token });
      const bySession = await readOrganiserState(trx, scene.eventId, { session });
      expect(bySession.state).toBe("panel");
      expect(bySession).toStrictEqual(byToken);
      expect(sentNumbers(bySession)).toEqual(["b", "c"]);
    });
  });

  /** Each case leaves the scene's event as it says, and gives what the request's body carries. */
  type Case = (trx: Db, scene: Awaited<ReturnType<typeof seedScene>>) => Promise<{ proof: unknown; expected: OrganiserPanelAnswer }>;
  const DAY = 24 * 60 * 60 * 1000;

  it.each<[string, Case]>([
    ["O2.6, OA7.7: pending, a token one character off", async (_, { token }) => ({ proof: { adminToken: oneCharOff(token) }, expected: { state: "pending" } })],
    ["OA7.7: pending, any account's session", async (trx) => ({ proof: { session: await seedSession(trx, await seedAccount(trx)) }, expected: { state: "pending" } })],
    // #586: a revoked token is a null hash, which no token matches.
    [
      "OA7.7: pending, the event's own token once revoked",
      async (trx, { eventId, token }) => {
        await trx.updateTable("event").set({ admin_token_hash: null }).where("id", "=", eventId).execute();
        return { proof: { adminToken: token }, expected: { state: "pending" } };
      },
    ],
    [
      "OA7.1: confirmed, neither session nor token",
      async (trx, { eventId }) => {
        await confirmSeededEvent(trx, eventId);
        return { proof: {}, expected: { state: "signIn" } };
      },
    ],
    [
      "OA9.6: confirmed, the organiser's session ended 91 days after its last visit",
      async (trx, { eventId }) => {
        const accountId = await confirmSeededEvent(trx, eventId);
        const session = await seedSession(trx, accountId, { lastVisitAt: new Date(Date.now() - 91 * DAY) });
        return { proof: { session }, expected: { state: "signIn" } };
      },
    ],
    [
      "OA7.2: confirmed, another account's session, which reads its own address",
      async (trx, { eventId }) => {
        await confirmSeededEvent(trx, eventId);
        const email = anAddress();
        const session = await seedSession(trx, await seedAccount(trx, { email }));
        return { proof: { session }, expected: { state: "notYours", email } };
      },
    ],
    [
      "OA7.9, OA9.5: the account deleted, the former organiser's session and the creation browser's token",
      async (trx, { eventId, token }) => {
        const accountId = await confirmSeededEvent(trx, eventId);
        const session = await seedSession(trx, accountId);
        await trx.deleteFrom("account").where("id", "=", accountId).execute();
        return { proof: { adminToken: token, session }, expected: { state: "orphan" } };
      },
    ],
    [
      "OA8.4: anonymised, the organiser's session",
      async (trx, { eventId }) => {
        const session = await seedSession(trx, await confirmSeededEvent(trx, eventId));
        await anonymiseEvent(trx, eventId);
        // What the organiser's screen shows: the title, the place, the dates and day 30 (OA8.4).
        const event = { title: "Tournoi de Rennes", location: "Gymnase des Gayeulles", allerAt: "2026-12-12 07:30:00", retourAt: "2026-12-12 18:00:00" };
        return { proof: { session }, expected: { state: "ended", event, erasedOn: "2027-01-11" } };
      },
    ],
  ])("%s: that state and nothing else, the persons never built", async (_, arrange) => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const { proof, expected } = await arrange(trx, scene);
      vi.mocked(organiserPersons).mockClear();
      const answer = await readOrganiserState(trx, scene.eventId, proof);
      expect(answer).toStrictEqual(expected);
      expect(sentNumbers(answer)).toEqual([]);
      expect(organiserPersons).not.toHaveBeenCalled();
    });
  });

  it("OA7.5: a bare token, as the old link's fragment was sent, opens nothing", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      expect(await readOrganiserState(trx, scene.eventId, scene.token)).toStrictEqual({ state: "pending" });
    });
  });

  it("O2.7: once C has taken a seat at the aller, the next read no longer carries C's number", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      expect(sentNumbers(await readOrganiserState(trx, scene.eventId, { adminToken: scene.token }))).toContain("c");
      await seedPlacement(trx, { personId: scene.c.id, eventId: scene.eventId, leg: "aller", rideId: scene.ride });
      const answer = await readOrganiserState(trx, scene.eventId, { adminToken: scene.token });
      expect(sentNumbers(answer)).toEqual(["b"]);
      expect(legOf(answer, "aller").withoutCar.map((person) => person.firstName)).toEqual(["D"]);
    });
  });

  it("O3.1, O3.5: the cars whose driver has no number, by departure time, until the driver adds one", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const eventId = scene.eventId;
      const f = await seedPerson(trx, eventId, { firstName: "F", phone: null });
      const g = await seedPerson(trx, eventId, { firstName: "G", phone: null });
      const late = await seedRide(trx, eventId, f.id, { leg: "retour", departureTime: "19:00:00", seats: 3 });
      const early = await seedRide(trx, eventId, g.id, {
        leg: "retour",
        departureTime: "18:15:00",
        location: "Gare",
        seats: 2,
      });
      await seedPlacement(trx, { personId: scene.b.id, eventId, leg: "retour", rideId: late });

      const retour = legOf(await readOrganiserState(trx, eventId, { adminToken: scene.token }), "retour");
      expect(retour.carCount).toBe(2);
      expect(retour.carsWithoutPhone).toStrictEqual([
        { id: early, driverFirstName: "G", departureTime: "18:15:00", location: "Gare", taken: 0, free: 2 },
        { id: late, driverFirstName: "F", departureTime: "19:00:00", location: "Mairie de Cesson", taken: 1, free: 2 },
      ]);

      await updatePerson(trx, { id: g.id, eventId }, { firstName: "G", phone: "06 77 77 77 77" });
      const after = legOf(await readOrganiserState(trx, eventId, { adminToken: scene.token }), "retour");
      expect(after.carsWithoutPhone.map((car) => car.id)).toEqual([late]);
      expect(after.carCount).toBe(2);
    });
  });

  it("O1.5, O1.7: an event without a retour and without anybody has one leg, empty", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx, { retourAt: null });
      const answer = await readOrganiserState(trx, id, { adminToken: token });
      expect(answer.state === "panel" && answer.legs.map((leg) => leg.leg)).toEqual(["aller"]);
      expect(legIsEmpty(legOf(answer, "aller"))).toBe(true);
    });
  });

  it("O1.6: persons without a car and no car: carCount is 0, and the leg is not empty", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      const retour = legOf(await readOrganiserState(trx, scene.eventId, { adminToken: scene.token }), "retour");
      expect(retour.carCount).toBe(0);
      expect(legIsEmpty(retour)).toBe(false);
    });
  });

  it("O2.10: writes nothing", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      // Every column of every row the panel reads: any write to them, an UPDATE included, shows.
      const rows = async () => ({
        event: await trx.selectFrom("event").selectAll().where("id", "=", scene.eventId).execute(),
        person: await trx.selectFrom("person").selectAll().where("event_id", "=", scene.eventId).orderBy("id").execute(),
        ride: await trx.selectFrom("ride").selectAll().where("event_id", "=", scene.eventId).orderBy("id").execute(),
        placement: await trx
          .selectFrom("placement")
          .selectAll()
          .where("event_id", "=", scene.eventId)
          .orderBy("person_id")
          .orderBy("leg")
          .execute(),
      });
      const before = await rows();
      expect(Object.values(before).map((table) => table.length)).toEqual([1, 5, 1, 5]);
      await readOrganiserState(trx, scene.eventId, { adminToken: scene.token });
      await readOrganiserState(trx, scene.eventId, { adminToken: oneCharOff(scene.token) });
      expect(await rows()).toStrictEqual(before);
    });
  });

  it("answers invalid for a well-formed id that is not stored, even with another event's token", async () => {
    await withRollback(async (trx) => {
      const scene = await seedScene(trx);
      expect(await readOrganiserState(trx, "Zz9yXw8v", { adminToken: scene.token })).toStrictEqual({ state: "invalid" });
    });
  });

  it("answers invalid for a malformed id, without reading the database", async () => {
    await expect(readOrganiserState(untouchable, "Ab3dEf70", { adminToken: "AAAAAAAAAAAAAAAAAAAAAA" })).resolves.toStrictEqual({
      state: "invalid",
    });
  });

  it("refuses to read in a READ COMMITTED transaction, rather than mixing snapshots", async () => {
    await expect(atomically(getDb(), (trx) => readOrganiserState(trx, "Zz9yXw8v", { adminToken: undefined }))).rejects.toThrow(
      "onOneSnapshot: the transaction given is in read committed, not repeatable read",
    );
  });
});

describe("readOrganiserState: the notice « Confirmez votre adresse » (OA1.7, OA1.10, OA2.1)", () => {
  const NOW = new Date("2026-10-27T09:00:00.000Z");
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const HOUR = 60 * 60_000;

  it.each([
    ["sent", "sent", ago(HOUR), "sent"],
    ["failed", "failed", ago(24 * HOUR), "failed"],
    ["the limit of the address", "address_limit", ago(24 * HOUR), "addressLimit"],
    ["still sending, 2 s ago", "sending", ago(2_000), "sending"],
    // The function killed: nothing will end it (comment on #600).
    ["still sending, 1 hour ago", "sending", ago(HOUR), "failed"],
  ] as const)("the creation browser's panel carries the address and the result kept: %s", async (_, status, at, send) => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx);
      const email = anAddress();
      await seedPendingSend(trx, id, { email, status, at });
      const answer = await readOrganiserState(trx, id, { adminToken: token }, NOW);
      expect(answer.state === "panel" && answer.pending).toStrictEqual({ email, send });
    });
  });

  it("OA7.7: anyone else reads « pending » and nothing else, never the address", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx);
      const email = anAddress();
      await seedPendingSend(trx, id, { email, status: "sent", at: ago(HOUR) });
      const session = await seedSession(trx, await seedAccount(trx));
      for (const proof of [{}, { adminToken: oneCharOff(token) }, { session }]) {
        const answer = await readOrganiserState(trx, id, proof, NOW);
        expect(answer).toStrictEqual({ state: "pending" });
        expect(JSON.stringify(answer)).not.toContain(email);
      }
    });
  });

  it("OA2.6: once confirmed, the panel has no notice, for the session as for the creation browser", async () => {
    await withRollback(async (trx) => {
      const { id, token } = await seedEvent(trx);
      await seedPendingSend(trx, id, { email: anAddress(), status: "sent", at: ago(HOUR) });
      // As a confirmation link leaves it: no address awaiting, then the account (#586).
      await trx.updateTable("event").set({ pending_email: null }).where("id", "=", id).execute();
      const accountId = await confirmSeededEvent(trx, id);
      const session = await seedSession(trx, accountId);
      for (const proof of [{ adminToken: token }, { session }]) {
        const answer = await readOrganiserState(trx, id, proof, NOW);
        expect(answer.state).toBe("panel");
        expect(answer).not.toHaveProperty("pending");
      }
    });
  });
});

describe("readOrganiserState: an event created with a session (OA1.3, OA7.6, review of #840)", () => {
  it("a real creation, read through the access rule: organiser for its session and for its admin token, not for another session", async () => {
    await withRollback(async (trx) => {
      const session = await seedSession(trx, await seedAccount(trx));
      const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const brevo: Brevo = { send: () => Promise.reject(new Error("OA1.3: no email goes with a session")) };
      const created = await createEventFor(
        { title: "Tournoi", location: "Gymnase", allerDate: date, allerTime: "07:30", session },
        { db: trx, now: new Date(), locale: "fr", origin: "https://fullcar.test", brevo, later: () => {} },
      );
      if (!created.ok) throw new Error(`expected an event, got ${JSON.stringify(created.errors)}`);

      expect((await readOrganiserState(trx, created.id, { session })).state).toBe("panel");
      expect((await readOrganiserState(trx, created.id, { adminToken: created.token })).state).toBe("panel");
      const email = anAddress();
      const other = await seedSession(trx, await seedAccount(trx, { email }));
      expect(await readOrganiserState(trx, created.id, { session: other })).toStrictEqual({ state: "notYours", email });
    });
  });
});
