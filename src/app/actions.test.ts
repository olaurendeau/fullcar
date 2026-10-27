import { sql, type Kysely, type Transaction } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAdminToken } from "@/domain/admin-token";
import { DESCRIPTION_MAX } from "@/domain/description";
import type { EventFields } from "@/domain/event";
import { isPublicId } from "@/domain/public-id";
import type { Database } from "@/db/schema";
import { anAddress, seedAccount, seedSession } from "@/db/test-accounts";
import { withRollback } from "@/db/test-db";
import { localeCookieOptions } from "@/i18n/locales";
import { createEvent, setLocale, visit } from "./actions";

// The action reaches the database through getDb(): here, the test's transaction,
// so that nothing it writes outlives the test.
const connection = vi.hoisted(() => ({ current: undefined as Kysely<Database> | undefined }));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDb: () => connection.current ?? actual.getDb() };
});

// The request the action reads its headers and cookies from, and the cookies it sets on the response.
const request = vi.hoisted(() => ({
  headers: new Headers(),
  cookies: new Map<string, string>(),
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name)! } : undefined),
    set: request.set,
  }),
}));

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
    throw Object.assign(new Error(`relation "event": ${POSTGRES_DETAIL}`), { code: "23505", detail: POSTGRES_DETAIL });
  },
});

/** The marker of event-description: a word nothing else writes, looked for wherever the description must not go. */
const MARKER = "Zorglub4729";
/** A link of the description: nothing on the server may call its host (DS3.3). */
const LINK = "https://lien-test.example/x";
/** Every way the server writes a line of log. */
const CONSOLE = ["log", "info", "warn", "error", "debug", "trace"] as const;

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

  describe("AL1.7, AL2.1, AL6.4: the position of the location", () => {
    it("stores the position sent, rounded to 5 decimals", async () => {
      const { row } = await created({ ...valid, locationPosition: { lat: 45.758126, lng: 4.689444 } });
      expect(row).toMatchObject({ location_lat: 45.75813, location_lng: 4.68944 });
    });

    it.each<[string, unknown]>([
      ["without a position", valid],
      ["with a null position", { ...valid, locationPosition: null }],
    ])("stores no position %s", async (_, fields) => {
      const { row } = await created(fields);
      expect(row).toMatchObject({ location_lat: null, location_lng: null });
    });

    it.each<[string, unknown]>([
      ["malformed", { ...valid, locationPosition: { lat: 45.7581, lng: "4.6894" } }],
      ["out of bounds", { ...valid, locationPosition: { lat: 45.7581, lng: -180.00001 } }],
      ["sent without a location", { ...valid, location: undefined, locationPosition: { lat: 45.7581, lng: 4.6894 } }],
    ])("creates nothing from a position %s: invalid, on the location", async (_, fields) => {
      expect(await refused(fields)).toEqual({ location: "invalid" });
    });
  });

  describe("event-description: the description", () => {
    it("stores none without a description, or with one invisible only", async () => {
      expect((await created(valid)).row.description).toBeNull();
      expect((await created({ ...valid, description: " \r\n\t\u00a0" })).row.description).toBeNull();
    });

    it(`DS1.6: stores ${DESCRIPTION_MAX} code points, an emoji counting as one; refuses one more and creates nothing`, async () => {
      const full = `${"🚗".repeat(10)}${"a".repeat(DESCRIPTION_MAX - 10)}`;
      expect((await created({ ...valid, description: full })).row.description).toBe(full);
      expect(await refused({ ...valid, description: `${full}b` })).toEqual({ description: "tooLong" });
    });

    // The migration writes its own limit, and the domain normalises before it counts.
    it(`stores a raw text over ${DESCRIPTION_MAX} that normalises to exactly ${DESCRIPTION_MAX}: the domain and the check agree`, async () => {
      const half = DESCRIPTION_MAX / 2 - 1;
      const stored = `${"🚗".repeat(10)}${"a".repeat(half - 10)}\n\n${"b".repeat(half)}`;
      const raw = `  ${stored.replace("\n\n", "   \r\n\r\n\r\n\r\n")}\t\n\n`;
      expect([...stored].length).toBe(DESCRIPTION_MAX);
      expect([...raw].length).toBeGreaterThan(DESCRIPTION_MAX);
      expect((await created({ ...valid, description: raw })).row.description).toBe(stored);
    });

    it.each<[string, unknown]>([
      ["a NUL character", "Rendez-vous\u0000à 7 h"],
      ["a number", 42],
      ["an array", ["Rendez-vous"]],
      ["an object", { text: "Rendez-vous" }],
      ["a boolean", true],
    ])("DS1.8: refuses %s as invalid, without an exception, and creates nothing", async (_, description) => {
      expect(await refused({ ...valid, description })).toEqual({ description: "invalid" });
    });

    it("DS3.3: makes no network call for a link in the description", async () => {
      const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in this test"));
      try {
        const description = `Le plan : ${LINK}`;
        expect((await created({ ...valid, description })).row.description).toBe(description);
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
      }
    });

    it("DS5.5: logs nothing of the description when the event is stored", async () => {
      const spies = CONSOLE.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
      try {
        await created({ ...valid, description: MARKER });
        expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });

    it("DS5.5: when the database fails, neither the log nor the error carries the description", async () => {
      // What Postgres says of a refused row quotes it, the description among its values.
      const detail = `Failing row contains (Ab3dEf7h, Match à Lyon, ${MARKER})`;
      connection.current = new Proxy({} as Kysely<Database>, {
        get() {
          throw Object.assign(new Error(`relation "event": ${detail}`), { code: "23514", detail, parameters: [MARKER] });
        },
      });
      const spies = CONSOLE.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
      try {
        const failure = await createEvent({ ...valid, description: MARKER }).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(Error);
        const { message, stack, cause } = failure as Error;
        for (const text of [message, stack, JSON.stringify(failure)]) {
          expect(text?.includes(MARKER)).toBe(false);
        }
        expect(cause).toBeUndefined();
        const logged = spies.flatMap((spy) => spy.mock.calls);
        expect(logged).toEqual([["createEvent: the event could not be stored (SQLSTATE 23514)"]]);
        expect(JSON.stringify(logged).includes(MARKER)).toBe(false);
      } finally {
        connection.current = undefined;
        for (const spy of spies) spy.mockRestore();
      }
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
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failure = await createEvent(valid).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const { message, stack, cause } = failure as Error;
      for (const text of [message, stack]) {
        expect(text).not.toContain("secret");
      }
      expect(cause).toBeUndefined();
      // The SQLSTATE alone tells an outage from a broken constraint: nothing else is logged.
      expect(log.mock.calls).toEqual([["createEvent: the event could not be stored (SQLSTATE 23505)"]]);
    } finally {
      connection.current = undefined;
      log.mockRestore();
    }
  });
});

describe("setLocale", () => {
  beforeEach(() => {
    request.headers = new Headers();
    request.set.mockReset();
  });

  it("L2.2: sets NEXT_LOCALE to the language asked, for the whole site, Lax, 365 days", async () => {
    request.headers = new Headers({ "x-forwarded-proto": "http" });
    expect(await setLocale("en")).toBe(true);
    expect(request.set.mock.calls).toEqual([["NEXT_LOCALE", "en", localeCookieOptions(false)]]);
  });

  it("L2.2: sets French back the same way", async () => {
    expect(await setLocale("fr")).toBe(true);
    expect(request.set.mock.calls).toEqual([["NEXT_LOCALE", "fr", localeCookieOptions(false)]]);
  });

  it.each([
    ["https", true],
    ["http", false],
    ["HTTPS", false],
    ["https, http", false],
    [undefined, false],
  ])("L2.2: with x-forwarded-proto %s, Secure is %s", async (proto, secure) => {
    request.headers = new Headers(proto === undefined ? {} : { "x-forwarded-proto": proto });
    await setLocale("en");
    expect(request.set.mock.calls).toEqual([["NEXT_LOCALE", "en", { ...localeCookieOptions(secure), secure }]]);
  });

  it.each([["de"], [""], ["EN"], [42], [undefined], [null], [["en"]], [{ locale: "en" }]])(
    "sets nothing and answers false for %j",
    async (value) => {
      expect(await setLocale(value)).toBe(false);
      expect(request.set).not.toHaveBeenCalled();
    },
  );
});

describe("visit", () => {
  const DAY = 24 * 60 * 60_000;
  const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
  const datesOf = (trx: Kysely<Database>, accountId: string) =>
    Promise.all([
      trx
        .selectFrom("account")
        .select(["locale", "last_visit_at", "warned_at"])
        .where("id", "=", accountId)
        .executeTakeFirstOrThrow(),
      trx
        .selectFrom("session")
        .select(["created_at", "last_visit_at"])
        .where("account_id", "=", accountId)
        .executeTakeFirstOrThrow(),
    ]);

  // The database writes its own now(): the server's clock is the real one here.
  beforeEach(() => {
    vi.useRealTimers();
    request.headers = new Headers();
    request.cookies = new Map();
  });

  // OA9.7: the inactivity is measured at the last visit with a session, never at its opening.
  it("OA9.7: slides a session opened 3 years ago, and notes the visit and the page's language on the account", async () => {
    request.cookies.set("NEXT_LOCALE", "en");
    await inTransaction(async (trx) => {
      const opened = daysAgo(3 * 365);
      const accountId = await seedAccount(trx, { locale: "fr", last_visit_at: daysAgo(40), warned_at: daysAgo(10) });
      const token = await seedSession(trx, accountId, { createdAt: opened, lastVisitAt: daysAgo(1) });
      const before = Date.now();
      expect(await visit(token)).toEqual({ session: "open" });
      const [account, session] = await datesOf(trx, accountId);
      expect(session.created_at).toEqual(opened);
      expect(session.last_visit_at.getTime()).toBeGreaterThan(before - 60_000);
      expect(account).toEqual({ locale: "en", last_visit_at: session.last_visit_at, warned_at: null });
    });
  });

  // OA3.1: the language of the page, as the request negotiates it; a de-DE browser reads French.
  it.each<[string, { cookie?: string; acceptLanguage: string }, "fr" | "en"]>([
    ["the language cookie", { cookie: "fr", acceptLanguage: "en-US,en;q=0.9" }, "fr"],
    ["Accept-Language, without a cookie", { acceptLanguage: "en-GB,en;q=0.9" }, "en"],
    ["the default, for a language the site does not have", { acceptLanguage: "de-DE,de;q=0.9" }, "fr"],
  ])("notes the language of %s", async (_, { cookie, acceptLanguage }, locale) => {
    if (cookie) request.cookies.set("NEXT_LOCALE", cookie);
    request.headers = new Headers({ "accept-language": acceptLanguage });
    await inTransaction(async (trx) => {
      const accountId = await seedAccount(trx, { locale: locale === "fr" ? "en" : "fr" });
      expect(await visit(await seedSession(trx, accountId))).toEqual({ session: "open" });
      const [account] = await datesOf(trx, accountId);
      expect(account.locale).toBe(locale);
    });
  });

  // OA9.6: a session lives 90 days after its last visit, and a visit does not bring it back.
  it("OA9.6: answers ended for a session last visited 91 days ago, and writes nothing", async () => {
    request.cookies.set("NEXT_LOCALE", "en");
    await inTransaction(async (trx) => {
      const accountId = await seedAccount(trx, { locale: "fr", last_visit_at: daysAgo(91) });
      const token = await seedSession(trx, accountId, { createdAt: daysAgo(200), lastVisitAt: daysAgo(91) });
      const seeded = await datesOf(trx, accountId);
      expect(await visit(token)).toEqual({ session: "ended" });
      expect(await datesOf(trx, accountId)).toEqual(seeded);
    });
  });

  it.each([
    ["an unknown token", "AAAAAAAAAAAAAAAAAAAAAA"],
    ["nothing", undefined],
    ["a number", 42],
    ["an object", { token: "kP3x-Vb7_Zq9Lt2Wn8Rc4g" }],
  ])("answers ended for %s", async (_, token) => {
    await inTransaction(async () => {
      expect(await visit(token)).toEqual({ session: "ended" });
    });
  });

  // Architecture, « Jetons »: neither a token nor an address is ever logged.
  it("logs nothing of a visit", async () => {
    const spies = CONSOLE.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      await inTransaction(async (trx) => {
        const token = await seedSession(trx, await seedAccount(trx, { email: anAddress() }));
        expect(await visit(token)).toEqual({ session: "open" });
      });
      expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("fails with a fixed error when the database fails, and neither the log nor the error carries the token", async () => {
    const token = "kP3x-Vb7_Zq9Lt2Wn8Rc4g";
    connection.current = failingDb;
    const spies = CONSOLE.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      const failure = await visit(token).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const { message, stack, cause } = failure as Error;
      for (const text of [message, stack, JSON.stringify(failure)]) {
        expect(text?.includes(token)).toBe(false);
        expect(text?.includes("secret")).toBe(false);
      }
      expect(cause).toBeUndefined();
      const logged = spies.flatMap((spy) => spy.mock.calls);
      expect(logged).toEqual([["visit: the visit could not be stored (SQLSTATE 23505)"]]);
    } finally {
      connection.current = undefined;
      for (const spy of spies) spy.mockRestore();
    }
  });
});
