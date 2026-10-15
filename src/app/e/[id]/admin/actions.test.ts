import type { Kysely, Transaction } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { newAdminToken } from "@/domain/admin-token";
import { generatePublicId } from "@/domain/public-id";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import nextConfig from "../../../../../next.config";
import { checkAdminLink } from "./actions";

// The action reaches the database through getDb(): here, the test's transaction.
const connection = vi.hoisted(() => ({ current: undefined as Kysely<Database> | undefined }));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDb: () => connection.current ?? actual.getDb() };
});

function using<T>(db: Kysely<Database>, fn: () => Promise<T>): Promise<T> {
  connection.current = db;
  return fn().finally(() => {
    connection.current = undefined;
  });
}

/** Checks `token` against a freshly seeded event, in a transaction rolled back after. */
function checkSeeded(token: (seeded: string) => unknown, id: (seeded: string) => unknown = (seeded) => seeded) {
  return withRollback((trx: Transaction<Database>) =>
    using(trx, async () => {
      const seeded = await seedEvent(trx, {});
      return checkAdminLink(id(seeded.id), token(seeded.token));
    }),
  );
}

/** A database whose every use fails, with what a Postgres error carries: `values` among it. */
const POSTGRES_DETAIL = "Failing row contains (Ab3dEf7h, secret title)";
let reads = 0;
function failingDb(...values: string[]): Kysely<Database> {
  return new Proxy({} as Kysely<Database>, {
    get() {
      reads++;
      throw Object.assign(new Error(`relation "event": ${POSTGRES_DETAIL} ${values.join(" ")}`), {
        code: "08006",
        detail: POSTGRES_DETAIL,
        parameters: values,
      });
    },
  });
}

function oneCharOff(token: string): string {
  const last = token.at(-1) === "A" ? "B" : "A";
  return `${token.slice(0, -1)}${last}`;
}

describe("checkAdminLink", () => {
  describe("C8.4", () => {
    it("accepts the event's token", async () => {
      expect(await checkSeeded((token) => token)).toBe(true);
    });

    it.each([
      ["another token", () => newAdminToken()],
      ["an empty token", () => ""],
      ["a token one character off", oneCharOff],
      ["a token one character short", (token: string) => token.slice(0, -1)],
      ["a token one character longer", (token: string) => `${token}A`],
    ])("refuses %s", async (_, token) => {
      expect(await checkSeeded(token)).toBe(false);
    });

    it("refuses the token in another case", async () => {
      // Its first character is a lowercase letter, so that upper-casing it always changes it.
      const token = `a${newAdminToken().slice(1)}`;
      const checks = await withRollback((trx) =>
        using(trx, async () => {
          const { id } = await seedEvent(trx, {}, token);
          return [await checkAdminLink(id, token), await checkAdminLink(id, token.toUpperCase())];
        }),
      );
      expect(checks).toEqual([true, false]);
    });

    it("refuses the token of another event", async () => {
      const valid = await withRollback((trx) =>
        using(trx, async () => {
          const first = await seedEvent(trx);
          const second = await seedEvent(trx);
          return checkAdminLink(first.id, second.token);
        }),
      );
      expect(valid).toBe(false);
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 42],
    ])("refuses a token that is %s", async (_, token) => {
      expect(await checkSeeded(() => token)).toBe(false);
    });

    it("refuses the token wrapped in an array or an object", async () => {
      expect(await checkSeeded((token) => [token])).toBe(false);
      expect(await checkSeeded((token) => ({ toString: () => token }))).toBe(false);
    });
  });

  it("refuses the token on an unknown id, or on the id in another case", async () => {
    expect(await checkSeeded((token) => token, () => "Zz9yXw8v")).toBe(false);
    // Its first character is a capital, so that lower-casing it always changes it; both stay
    // valid ids whatever the rest of the draw, so only the database can tell them apart.
    const checks = await withRollback((trx) =>
      using(trx, async () => {
        const { id, token } = await seedEvent(trx, {}, undefined, () => `A${generatePublicId().slice(1)}`);
        return [await checkAdminLink(id, token), await checkAdminLink(`a${id.slice(1)}`, token)];
      }),
    );
    expect(checks).toEqual([true, false]);
  });

  it.each([
    ["too short", "Ab3dEf7"],
    ["too long", "Ab3dEf7hj"],
    ["with an ambiguous character", "Ab3dEf7l"],
    ["with a NUL", "Ab3dEf7\u0000"],
    ["with SQL in it", "' or 1=1"],
    ["not a string", 12345678],
    ["an array", ["Ab3dEf7h"]],
    ["missing", undefined],
  ])("refuses an id %s without reading the database", async (_, id) => {
    reads = 0;
    expect(await using(failingDb(), () => checkAdminLink(id, newAdminToken()))).toBe(false);
    expect(reads).toBe(0);
  });

  it("fails with a generic error, carrying neither the database's detail nor the token", async () => {
    const token = newAdminToken();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failure = await using(failingDb(token), () => checkAdminLink("Ab3dEf7h", token)).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const { message, stack, cause } = failure as Error;
      for (const text of [message, stack, JSON.stringify(failure)]) {
        expect(text).not.toContain(POSTGRES_DETAIL);
        expect(text).not.toContain(token);
      }
      expect(cause).toBeUndefined();
      // The SQLSTATE alone: never the token, whole or truncated, nor the database's detail.
      expect(log.mock.calls).toEqual([["checkAdminLink: the event could not be read (SQLSTATE 08006)"]]);
    } finally {
      log.mockRestore();
    }
  });

  // C6.6: `next dev` prints each Server Function call with its arguments, the token among them.
  it("sets logging.serverFunctions to false in the Next config", () => {
    expect(nextConfig.logging).toMatchObject({ serverFunctions: false });
  });
});
