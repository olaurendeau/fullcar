import type { Kysely, Transaction } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/schema";
import { anAddress, seedAccount, seedSession } from "@/db/test-accounts";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { myEvents } from "./actions";

// The action reaches the database through getDb(): here, the test's transaction.
const connection = vi.hoisted(() => ({ current: undefined as Kysely<Database> | undefined }));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDb: () => connection.current ?? actual.getDb() };
});

function inTransaction<T>(fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
  return withRollback(async (trx) => {
    connection.current = trx;
    try {
      return await fn(trx);
    } finally {
      connection.current = undefined;
    }
  });
}

/** A database whose every use fails with what a Postgres error carries. */
const POSTGRES_DETAIL = "Failing row contains (camille@exemple.fr)";
const failingDb = new Proxy({} as Kysely<Database>, {
  get() {
    throw Object.assign(new Error(`relation "session": ${POSTGRES_DETAIL}`), { code: "57P01", detail: POSTGRES_DETAIL });
  },
});

const CONSOLE = ["log", "info", "warn", "error", "debug", "trace"] as const;

afterEach(() => {
  connection.current = undefined;
  vi.restoreAllMocks();
});

describe("myEvents", () => {
  it("reads the events of the session whose token the body carries, and logs nothing", async () => {
    const spies = CONSOLE.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    await inTransaction(async (trx) => {
      const email = anAddress();
      const accountId = await seedAccount(trx, { email });
      const token = await seedSession(trx, accountId);
      // Far ahead of the real clock, which the action reads: upcoming.
      const { id } = await seedEvent(trx, { allerAt: "2099-06-01 09:00:00", retourAt: null });
      await trx.updateTable("event").set({ account_id: accountId, confirmed_at: new Date() }).where("id", "=", id).execute();
      expect(await myEvents(token)).toMatchObject({ state: "events", email, upcoming: [{ id }], past: [] });
    });
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });

  it("OA6.8: answers signIn without a session", async () => {
    await inTransaction(async () => {
      expect(await myEvents(undefined)).toEqual({ state: "signIn" });
    });
  });

  it("fails with a fixed error when the database fails, and neither the log nor the error carries the token", async () => {
    const token = "kP3x-Vb7_Zq9Lt2Wn8Rc4g";
    connection.current = failingDb;
    const spies = CONSOLE.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    const failure = await myEvents(token).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const { message, stack, cause } = failure as Error;
    for (const text of [message, stack, JSON.stringify(failure)]) {
      expect(text?.includes(token)).toBe(false);
      expect(text?.includes("exemple.fr")).toBe(false);
    }
    expect(cause).toBeUndefined();
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([["myEvents: the events could not be read (SQLSTATE 57P01)"]]);
  });
});
