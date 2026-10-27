import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, getDb } from "./client";
import type { Database } from "./schema";
import { whileHeld, withCommittedEvent } from "./test-committed";

// A pool of its own: a second connection, which only sees what was committed.
let observer: Kysely<Database>;
beforeAll(() => {
  observer = createDb(process.env.DATABASE_URL!);
});
afterAll(async () => {
  await observer?.destroy();
});

async function eventExists(id: string): Promise<boolean> {
  const row = await observer.selectFrom("event").select("id").where("id", "=", id).executeTakeFirst();
  return row !== undefined;
}

/** How many rows each table holds for the event, as a second connection sees them. */
function rowsOf(eventId: string) {
  return Promise.all(
    (["person", "ride", "placement"] as const).map(async (table) =>
      (await observer.selectFrom(table).select("event_id").where("event_id", "=", eventId).execute()).length,
    ),
  );
}

describe("withCommittedEvent", () => {
  it("hands the application's connection and an event committed for the test alone", async () => {
    let seen = "";
    await withCommittedEvent(async (db, eventId) => {
      seen = eventId;
      expect(db).toBe(getDb());
      expect(await eventExists(eventId)).toBe(true);
    });
    expect(seen).not.toBe("");
  });

  it("gives each test an event of its own", async () => {
    const ids = await Promise.all([
      withCommittedEvent(async (_, eventId) => eventId),
      withCommittedEvent(async (_, eventId) => eventId),
    ]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("deletes the event at the end, and returns what the callback returns", async () => {
    let id = "";
    const value = await withCommittedEvent(async (_, eventId) => {
      id = eventId;
      return 42;
    });
    expect(value).toBe(42);
    expect(await eventExists(id)).toBe(false);
  });

  it("deletes the event and rethrows when the callback throws", async () => {
    const failure = new Error("boom");
    let id = "";
    await expect(
      withCommittedEvent(async (_, eventId) => {
        id = eventId;
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(id).not.toBe("");
    expect(await eventExists(id)).toBe(false);
  });

  it("takes the event's people, rides and placements with it", async () => {
    let id = "";
    let committed: number[] = [];
    await withCommittedEvent(async (db, eventId) => {
      id = eventId;
      const personId = randomUUID();
      await db
        .insertInto("person")
        .values({ id: personId, event_id: eventId, first_name: "Léa", token_hash: Buffer.alloc(32, 7) })
        .execute();
      await db
        .insertInto("ride")
        .values({
          id: randomUUID(),
          event_id: eventId,
          leg: "aller",
          driver_id: personId,
          location: "Mairie de Cesson",
          departure_time: "07:15:00",
          seats: 3,
        })
        .execute();
      await db.insertInto("placement").values({ person_id: personId, event_id: eventId, leg: "retour" }).execute();
      committed = await rowsOf(eventId);
    });
    expect(committed).toEqual([1, 1, 1]);
    expect(await rowsOf(id)).toEqual([0, 0, 0]);
  });

  it("rethrows the callback's error, not the delete's, when both fail", async () => {
    const failure = new Error("boom");
    const failedDelete = { where: () => ({ execute: () => Promise.reject(new Error("delete failed")) }) };
    const deleteFrom = vi.spyOn(getDb(), "deleteFrom").mockReturnValueOnce(failedDelete as never);
    let id = "";
    try {
      await expect(
        withCommittedEvent(async (_, eventId) => {
          id = eventId;
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(deleteFrom).toHaveBeenCalledWith("event");
    } finally {
      // The event is left over: deleted here instead.
      deleteFrom.mockRestore();
      await observer.deleteFrom("event").where("id", "=", id).execute();
    }
  });
});

describe("whileHeld", () => {
  // A key that neither the application nor WINDOW_LOCK (test-accounts.ts) takes.
  const takeKey = (db: Kysely<Database>) => sql`select pg_advisory_xact_lock(5950, 0)`.execute(db);
  const pidOf = async (db: Kysely<Database>) =>
    (await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(db)).rows[0]!.pid;

  it("lets second wait for first on a connection of its own, then gives what second gives", async () => {
    let holding = 0;
    let ownPid = 0;
    let waiting = 0;
    const answer = await whileHeld(
      getDb(),
      async (trx) => {
        holding = await pidOf(trx);
        await takeKey(trx);
      },
      async (own) => {
        ownPid = await pidOf(own);
        await takeKey(own);
        return "second";
      },
      async (pid) => void (waiting = pid),
    );
    expect(answer).toBe("second");
    expect(waiting).toBe(ownPid);
    expect(ownPid).not.toBe(holding);
  });

  it("gives back second's connection only once second is over, when it fails while second waits", async () => {
    let secondOver = false;
    await expect(
      whileHeld(
        getDb(),
        (trx) => takeKey(trx),
        async (own) => {
          await takeKey(own);
          secondOver = true;
        },
        async () => {
          throw new Error("whileWaiting failed");
        },
      ),
    ).rejects.toThrow("whileWaiting failed");
    expect(secondOver).toBe(true);
  });

  // #841: a session of another test file, waiting for the same lock (the global cap of the sends), proves nothing.
  it("fails when another session waits for first, but second never does", async () => {
    let stranger: Promise<unknown> | undefined;
    await expect(
      whileHeld(
        getDb(),
        (trx) => takeKey(trx),
        async () => {
          // Waits on a pool of its own, as a test of another file would; second itself waits for nothing.
          stranger = takeKey(observer);
          await new Promise((resolve) => setTimeout(resolve, 500));
          return "second";
        },
      ),
    ).rejects.toThrow("whileHeld: second ended without waiting for first");
    await stranger;
  });
});
