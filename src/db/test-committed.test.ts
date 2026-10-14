import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, getDb } from "./client";
import type { Database } from "./schema";
import { withCommittedEvent } from "./test-committed";

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
});
