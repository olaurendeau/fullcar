import type { Kysely, Transaction } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { newAdminToken } from "@/domain/admin-token";
import { generatePublicId } from "@/domain/public-id";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import nextConfig from "../../../../../next.config";
import { loadOrganiserPanel } from "./actions";

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

const PHONE = "06 33 33 33 33";
const INVALID = { state: "invalid" };

/**
 * Loads the panel with `token`, on a freshly seeded event where C, who has a number, is
 * without a car at the aller, in a transaction rolled back after.
 */
function loadSeeded(token: (seeded: string) => unknown, id: (seeded: string) => unknown = (seeded) => seeded) {
  return withRollback((trx: Transaction<Database>) =>
    using(trx, async () => {
      const seeded = await seedEvent(trx, {});
      const c = await seedPerson(trx, seeded.id, { firstName: "C", phone: PHONE });
      await seedPlacement(trx, { personId: c.id, eventId: seeded.id, leg: "aller", rideId: null });
      return { c: c.id, answer: await loadOrganiserPanel(id(seeded.id), token(seeded.token)) };
    }),
  );
}

/** The panel of an event without a retour and without anybody. */
const EMPTY_PANEL = {
  state: "panel",
  legs: [{ leg: "aller", coverage: { withoutCar: 0, freeSeats: 0 }, carCount: 0, withoutCar: [], carsWithoutPhone: [] }],
};

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

describe("loadOrganiserPanel", () => {
  describe("O6.2, C8.4", () => {
    it("gives the panel for the event's token, the number of the person without a car in it", async () => {
      const { c, answer } = await loadSeeded((token) => token);
      expect(answer).toStrictEqual({
        state: "panel",
        legs: [
          {
            leg: "aller",
            coverage: { withoutCar: 1, freeSeats: 0 },
            carCount: 0,
            withoutCar: [{ id: c, firstName: "C", phone: PHONE }],
            carsWithoutPhone: [],
          },
          { leg: "retour", coverage: { withoutCar: 0, freeSeats: 0 }, carCount: 0, withoutCar: [], carsWithoutPhone: [] },
        ],
      });
    });

    it.each([
      ["another token", () => newAdminToken()],
      ["an empty token", () => ""],
      ["a token one character off", oneCharOff],
      ["a token one character short", (token: string) => token.slice(0, -1)],
      ["a token one character longer", (token: string) => `${token}A`],
    ])("answers invalid, and nothing else, for %s", async (_, token) => {
      expect((await loadSeeded(token)).answer).toStrictEqual(INVALID);
    });

    it("answers invalid for the token in another case", async () => {
      // Its first character is a lowercase letter, so that upper-casing it always changes it.
      const token = `a${newAdminToken().slice(1)}`;
      const answers = await withRollback((trx) =>
        using(trx, async () => {
          const { id } = await seedEvent(trx, { retourAt: null }, token);
          return [await loadOrganiserPanel(id, token), await loadOrganiserPanel(id, token.toUpperCase())];
        }),
      );
      expect(answers).toStrictEqual([EMPTY_PANEL, INVALID]);
    });

    it("answers invalid for the token of another event", async () => {
      const answer = await withRollback((trx) =>
        using(trx, async () => {
          const first = await seedEvent(trx);
          const second = await seedEvent(trx);
          return loadOrganiserPanel(first.id, second.token);
        }),
      );
      expect(answer).toStrictEqual(INVALID);
    });

    it.each([
      ["undefined", undefined],
      ["null", null],
      ["a number", 42],
    ])("answers invalid for a token that is %s", async (_, token) => {
      expect((await loadSeeded(() => token)).answer).toStrictEqual(INVALID);
    });

    it("answers invalid for the token wrapped in an array or an object", async () => {
      expect((await loadSeeded((token) => [token])).answer).toStrictEqual(INVALID);
      expect((await loadSeeded((token) => ({ toString: () => token }))).answer).toStrictEqual(INVALID);
    });
  });

  it("answers invalid for the token on an unknown id, or on the id in another case", async () => {
    expect((await loadSeeded((token) => token, () => "Zz9yXw8v")).answer).toStrictEqual(INVALID);
    // Its first character is a capital, so that lower-casing it always changes it; both stay
    // valid ids whatever the rest of the draw, so only the database can tell them apart.
    const answers = await withRollback((trx) =>
      using(trx, async () => {
        const newId = () => `A${generatePublicId().slice(1)}`;
        const { id, token } = await seedEvent(trx, { retourAt: null }, undefined, newId);
        return [await loadOrganiserPanel(id, token), await loadOrganiserPanel(`a${id.slice(1)}`, token)];
      }),
    );
    expect(answers).toStrictEqual([EMPTY_PANEL, INVALID]);
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
  ])("answers invalid for an id %s without reading the database", async (_, id) => {
    reads = 0;
    expect(await using(failingDb(), () => loadOrganiserPanel(id, newAdminToken()))).toStrictEqual(INVALID);
    expect(reads).toBe(0);
  });

  it("fails with a generic error, carrying neither the database's detail nor the token", async () => {
    const token = newAdminToken();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failure = await using(failingDb(token), () => loadOrganiserPanel("Ab3dEf7h", token)).then(
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
      expect(log.mock.calls).toEqual([["loadOrganiserPanel: the panel could not be read (SQLSTATE 08006)"]]);
    } finally {
      log.mockRestore();
    }
  });

  // O6.4: neither the token nor the panel, which carries numbers, is logged on a read.
  it("logs nothing, with the right token or a wrong one", async () => {
    const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      await loadSeeded((token) => token);
      await loadSeeded(oneCharOff);
      expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  // C6.6, O6.4: `next dev` prints each Server Function call with its arguments, the token among them.
  it("sets logging.serverFunctions to false in the Next config", () => {
    expect(nextConfig.logging).toMatchObject({ serverFunctions: false });
  });
});
