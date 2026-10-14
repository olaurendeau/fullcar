import { sql, type Kysely, type Transaction } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAdminToken } from "@/domain/admin-token";
import type { EventFields } from "@/domain/event";
import { isPublicId } from "@/domain/public-id";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { createEvent } from "./actions";

// The action reaches the database through getDb(): here, the test's transaction,
// so that nothing it writes outlives the test.
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
const POSTGRES_DETAIL = 'Failing row contains (Ab3dEf7h, secret title)';
const failingDb = new Proxy({} as Kysely<Database>, {
  get() {
    throw Object.assign(new Error(`relation "event": ${POSTGRES_DETAIL}`), { detail: POSTGRES_DETAIL });
  },
});

function countEvents(trx: Transaction<Database>) {
  return trx
    .selectFrom("event")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .executeTakeFirstOrThrow()
    .then((row) => Number(row.n));
}

/** What the action does to the database: its result, and how many events it added. */
async function create(fields: unknown) {
  return inTransaction(async (trx) => {
    const before = await countEvents(trx);
    const result = await createEvent(fields);
    const row = result.ok
      ? await trx.selectFrom("event").selectAll().where("id", "=", result.id).executeTakeFirstOrThrow()
      : undefined;
    return { result, row, added: (await countEvents(trx)) - before };
  });
}

async function created(fields: unknown) {
  const { result, row, added } = await create(fields);
  if (!result.ok || !row) throw new Error(`expected an event, got ${JSON.stringify(result)}`);
  expect(added).toBe(1);
  return { ...result, row };
}

async function refused(fields: unknown) {
  const { result, added } = await create(fields);
  if (result.ok) throw new Error("expected errors, got an event");
  expect(added).toBe(0);
  return result.errors;
}

// The server's clock: 13 October 2026, 00:30 UTC.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T00:30:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

const valid: EventFields = {
  title: "  Match à Lyon ",
  location: "Gymnase Jean Macé",
  allerDate: "2026-12-12",
  allerTime: "07:30",
  retour: true,
  retourDate: "2026-12-12",
  retourTime: "18:00",
};

describe("createEvent", () => {
  it("stores the event and returns its id and the organiser's token in its result", async () => {
    const { id, token, row } = await created(valid);
    expect(isPublicId(id)).toBe(true);
    expect(row).toMatchObject({
      title: "Match à Lyon",
      location: "Gymnase Jean Macé",
      aller_at: "2026-12-12 07:30:00",
      retour_at: "2026-12-12 18:00:00",
    });
    expect(row.admin_token_hash).toEqual(Buffer.from(hashAdminToken(token), "hex"));
  });

  describe("C1.9: the server applies the rules itself", () => {
    it("creates nothing from an empty form and returns an error per field", async () => {
      expect(await refused({ retour: true })).toEqual({
        title: "required",
        location: "required",
        allerDate: "required",
        allerTime: "required",
        retourDate: "required",
        retourTime: "required",
      });
    });

    it("creates nothing when the retour does not follow the aller", async () => {
      expect(await refused({ ...valid, retourTime: "07:30" })).toEqual({ retourTime: "notAfterAller" });
    });

    it("accepts from the UTC date − 1 day, which the device's rule would refuse", async () => {
      const { row } = await created({ ...valid, allerDate: "2026-10-12", retourDate: "2026-10-12" });
      expect(row.aller_at).toBe("2026-10-12 07:30:00");
      expect(await refused({ ...valid, allerDate: "2026-10-11" })).toEqual({ allerDate: "tooEarly" });
    });

    it("accepts up to the UTC date + 366 days, and not one day more", async () => {
      const { row } = await created({ ...valid, allerDate: "2027-10-14", retourDate: "2027-10-14" });
      expect(row.retour_at).toBe("2027-10-14 18:00:00");
      expect(await refused({ ...valid, allerDate: "2027-10-15", retourDate: "2027-10-15" })).toEqual({
        allerDate: "tooLate",
        retourDate: "tooLate",
      });
    });

    it("follows the clock: a day later, the same date is too early", async () => {
      vi.setSystemTime(new Date("2026-10-14T00:30:00Z"));
      expect(await refused({ ...valid, allerDate: "2026-10-12" })).toEqual({ allerDate: "tooEarly" });
    });
  });

  describe("C1.9: a forged request gets field errors, not a server error", () => {
    it.each([
      ["nothing", undefined],
      ["null", null],
      ["a string", "title=Match"],
      ["an array", [valid]],
    ])("refuses %s as an empty form without retour", async (_, fields) => {
      expect(await refused(fields)).toEqual({
        title: "required",
        location: "required",
        allerDate: "required",
        allerTime: "required",
      });
    });

    it("counts a field that is not a string as missing", async () => {
      expect(await refused({ ...valid, title: 42, location: ["Gymnase"], allerTime: { h: 7 } })).toEqual({
        title: "required",
        location: "required",
        allerTime: "required",
      });
    });

    it("refuses a NUL character in the title or the location", async () => {
      expect(await refused({ ...valid, title: "Match\u0000", location: "\u0000Gymnase" })).toEqual({
        title: "invalid",
        location: "invalid",
      });
    });

    it("enables an option only for a true boolean", async () => {
      const { row } = await created({ ...valid, boosters: "true", participation: 1, stops: {} });
      expect(row).toMatchObject({ boosters_enabled: false, participation_enabled: false, stops_enabled: false });
    });
  });

  it("C2.3: without the retour box, stores no retour, even with retour values typed", async () => {
    const { row } = await created({ ...valid, retour: false, retourDate: "2026-12-13", retourTime: "18:00" });
    expect(row.retour_at).toBeNull();
  });

  it("C3.2: options left untouched are stored disabled", async () => {
    const { row } = await created(valid);
    expect(row).toMatchObject({ boosters_enabled: false, participation_enabled: false, stops_enabled: false });
  });

  it.each([
    ["boosters", { boosters_enabled: true, participation_enabled: false, stops_enabled: false }],
    ["participation", { boosters_enabled: false, participation_enabled: true, stops_enabled: false }],
    ["stops", { boosters_enabled: false, participation_enabled: false, stops_enabled: true }],
  ])("C3.3: enabling %s stores it alone enabled", async (option, expected) => {
    const { row } = await created({ ...valid, [option]: true });
    expect(row).toMatchObject(expected);
  });

  describe("C8.3: the token", () => {
    it("has at least 128 bits, and a new one each time", async () => {
      const first = await created(valid);
      const second = await created(valid);
      expect(Buffer.from(first.token, "base64url").length).toBeGreaterThanOrEqual(16);
      expect(second.token).not.toBe(first.token);
    });

    it("is in no column of the row, in any encoding of it", async () => {
      const { token, json, hash } = await inTransaction(async (trx) => {
        const result = await createEvent(valid);
        if (!result.ok) throw new Error("expected an event");
        const { rows } = await sql<{ json: string; hash: Buffer }>`
          select to_jsonb(event)::text as json, admin_token_hash as hash
          from event where id = ${result.id}`.execute(trx);
        return { token: result.token, ...rows[0]! };
      });
      for (const text of [json, hash.toString("hex"), hash.toString("base64url"), hash.toString("latin1")]) {
        expect(text).not.toContain(token);
      }
      expect(hash).not.toEqual(Buffer.from(token, "base64url"));
    });
  });

  it("fails with a generic error, without the database's detail, when the database fails", async () => {
    connection.current = failingDb;
    try {
      const failure = await createEvent(valid).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).not.toContain(POSTGRES_DETAIL);
      expect((failure as Error).cause).toBeUndefined();
      expect(JSON.stringify(failure)).not.toContain("secret");
    } finally {
      connection.current = undefined;
    }
  });
});
