import type { Kysely, Transaction } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { newAdminToken } from "@/domain/admin-token";
import { generatePublicId } from "@/domain/public-id";
import type { Database } from "@/db/schema";
import { withRollback } from "@/db/test-db";
import { seedEvent } from "@/db/test-events";
import { seedPerson, seedPlacement } from "@/db/test-participants";
import nextConfig from "../../../../../next.config";
import { loadOrganiserPanel, updateEvent } from "./actions";

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
  persons: [],
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
        // RP4.2: C again, without the number.
        persons: [
          {
            id: c,
            firstName: "C",
            cells: [
              { leg: "aller", state: { kind: "withoutCar" } },
              { leg: "retour", state: { kind: "notConcerned" } },
            ],
          },
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
  it("sets logging.serverFunctions to false in the Next config", async () => {
    expect((await nextConfig()).logging).toMatchObject({ serverFunctions: false });
  });
});

describe("updateEvent", () => {
  const BEFORE = {
    title: "Tournoi de Rennes",
    location: "Gymnase des Gayeulles",
    locationPosition: null,
    allerAt: "2026-12-12 07:30:00",
    retourAt: "2026-12-12 18:00:00",
  };
  const FIELDS = {
    title: "Tournoi de Rennes U13",
    location: BEFORE.location,
    allerDate: "2026-12-12",
    allerTime: "07:30",
    retour: true,
    retourDate: "2026-12-12",
    retourTime: "18:00",
  };

  it("changes the event for its token, from the request's body, and answers without the token", async () => {
    const { answer, token, title } = await withRollback((trx) =>
      using(trx, async () => {
        const { id, token } = await seedEvent(trx);
        const answer = await updateEvent(id, token, FIELDS, BEFORE);
        const row = await trx.selectFrom("event").select("title").where("id", "=", id).executeTakeFirstOrThrow();
        return { answer, token, title: row.title };
      }),
    );
    expect(answer).toEqual({ ok: true, event: { ...BEFORE, title: FIELDS.title, description: null } });
    expect(title).toBe(FIELDS.title);
    expect(JSON.stringify(answer).includes(token)).toBe(false);
  });

  it("answers invalid for another token, and writes nothing", async () => {
    const { answer, title } = await withRollback((trx) =>
      using(trx, async () => {
        const { id, token } = await seedEvent(trx);
        const answer = await updateEvent(id, oneCharOff(token), FIELDS, BEFORE);
        const row = await trx.selectFrom("event").select("title").where("id", "=", id).executeTakeFirstOrThrow();
        return { answer, title: row.title };
      }),
    );
    expect(answer).toEqual({ ok: false, error: "invalid" });
    expect(title).toBe(BEFORE.title);
  });

  it.each<[string, (seeded: { token: string; personToken: string }) => unknown]>([
    ["another token", ({ token }) => oneCharOff(token)],
    ["a participant's token", ({ personToken }) => personToken],
    ["no token", () => undefined],
  ])("DS1.13: answers invalid for a description sent with %s, and writes nothing", async (_, tokenOf) => {
    const { answer, row } = await withRollback((trx) =>
      using(trx, async () => {
        const { id, token } = await seedEvent(trx, { description: "Rendez-vous à 7 h" });
        const { token: personToken } = await seedPerson(trx, id);
        const fields = { ...FIELDS, title: BEFORE.title, description: "Zorglub4729" };
        const answer = await updateEvent(id, tokenOf({ token, personToken }), fields, BEFORE);
        const row = await trx.selectFrom("event").select("description").where("id", "=", id).executeTakeFirstOrThrow();
        return { answer, row };
      }),
    );
    expect(answer).toEqual({ ok: false, error: "invalid" });
    expect(row.description).toBe("Rendez-vous à 7 h");
  });

  it.each([
    ["too short", "Ab3dEf7"],
    ["with SQL in it", "' or 1=1"],
    ["not a string", 12345678],
    ["missing", undefined],
  ])("answers eventNotFound for an id %s without reading the database", async (_, id) => {
    reads = 0;
    expect(await using(failingDb(), () => updateEvent(id, newAdminToken(), FIELDS, BEFORE))).toEqual({
      ok: false,
      error: "eventNotFound",
    });
    expect(reads).toBe(0);
  });

  it("fails with a generic error, carrying neither the database's detail nor the token", async () => {
    const token = newAdminToken();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failure = await using(failingDb(token), () => updateEvent("Ab3dEf7h", token, FIELDS, BEFORE)).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const { message, stack, cause } = failure as Error;
      for (const text of [message, stack, JSON.stringify(failure)]) {
        expect(text?.includes(POSTGRES_DETAIL)).toBe(false);
        expect(text?.includes(token)).toBe(false);
      }
      expect(cause).toBeUndefined();
      expect(log.mock.calls).toEqual([["updateEvent: the event could not be changed (SQLSTATE 08006)"]]);
    } finally {
      log.mockRestore();
    }
  });

  it("DS5.5: when the database fails, neither the log nor the error carries the description", async () => {
    const marker = "Zorglub4729";
    const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      const fields = { ...FIELDS, description: marker };
      const failure = await using(failingDb(marker), () => updateEvent("Ab3dEf7h", newAdminToken(), fields, BEFORE)).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const { message, stack, cause } = failure as Error;
      for (const text of [message, stack, JSON.stringify(failure)]) {
        expect(text?.includes(marker)).toBe(false);
      }
      expect(cause).toBeUndefined();
      const logged = spies.flatMap((spy) => spy.mock.calls);
      expect(logged).toEqual([["updateEvent: the event could not be changed (SQLSTATE 08006)"]]);
      expect(JSON.stringify(logged).includes(marker)).toBe(false);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("logs nothing, with the right token or a wrong one", async () => {
    const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
    const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      await withRollback((trx) =>
        using(trx, async () => {
          const { id, token } = await seedEvent(trx);
          await updateEvent(id, oneCharOff(token), FIELDS, BEFORE);
          await updateEvent(id, token, FIELDS, BEFORE);
        }),
      );
      expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
