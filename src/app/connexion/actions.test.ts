import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/schema";
import { anAddress, seedAccount, withRollbackRecordingSends } from "@/db/test-accounts";
import { requestLink } from "./actions";

// The action reaches the database through getDb(): here, the test's transaction.
const connection = vi.hoisted(() => ({ current: undefined as Kysely<Database> | undefined }));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDb: () => connection.current ?? actual.getDb() };
});

// The request the action reads the page's language from.
const request = vi.hoisted(() => ({ headers: new Headers(), cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({ get: () => (request.cookie === undefined ? undefined : { value: request.cookie }) }),
}));

/** What the action asked Brevo: its subjects and its recipients. */
let brevo: { to: string; subject: string }[];
let logs: string[];
beforeEach(() => {
  brevo = [];
  logs = [];
  request.headers = new Headers();
  request.cookie = undefined;
  vi.stubEnv("BREVO_URL", "http://brevo.test/v3/smtp/email");
  vi.stubEnv("BREVO_API_KEY", "fullcar-test-brevo-key-4d8e1b6a");
  vi.stubEnv("EMAIL_FROM", "Fullcar <bonjour@fullcar.test>");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: { email: string }[]; subject: string };
      brevo.push({ to: body.to[0]!.email, subject: body.subject });
      return new Response(null, { status: 201 });
    }),
  );
  for (const level of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args.map(String).join(" ")));
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function inTransaction<T>(fn: (trx: Kysely<Database>) => Promise<T>): Promise<T> {
  return withRollbackRecordingSends(async (trx) => {
    connection.current = trx;
    try {
      return await fn(trx);
    } finally {
      connection.current = undefined;
    }
  });
}

describe("requestLink", () => {
  // OA3.1: in the page's language, and a de-DE browser gets French.
  it("sends the email in the language the page negotiates", async () => {
    await inTransaction(async (trx) => {
      const email = anAddress();
      await seedAccount(trx, { email, locale: "en" });
      request.headers = new Headers({ "accept-language": "de-DE,de;q=0.9" });
      expect(await requestLink(email, null)).toEqual({ state: "sent" });
      request.headers = new Headers({ "accept-language": "en-GB,en;q=0.9" });
      await requestLink(email, null);
      request.cookie = "fr";
      await requestLink(email, null);
      expect(brevo).toEqual([
        { to: email, subject: "Votre lien de connexion à Fullcar" },
        { to: email, subject: "Your Fullcar sign-in link" },
        { to: email, subject: "Votre lien de connexion à Fullcar" },
      ]);
    });
  });

  it("answers failed when Brevo refuses, and logs no address", async () => {
    await inTransaction(async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
      const email = anAddress();
      expect(await requestLink(email, null)).toEqual({ state: "failed" });
      expect(logs).toEqual(["email: send failed (HTTP 500)"]);
    });
  });

  it("throws a fixed error, with the database's code alone in the log, when the database fails", async () => {
    const email = anAddress();
    connection.current = new Proxy({} as Kysely<Database>, {
      get() {
        throw Object.assign(new Error(`Failing row contains (${email})`), { code: "57P01", detail: email });
      },
    });
    try {
      await expect(requestLink(email, null)).rejects.toThrow(new Error("requestLink: the sign-in request failed"));
    } finally {
      connection.current = undefined;
    }
    expect(logs).toEqual(["requestLink: the sign-in request failed (SQLSTATE 57P01)"]);
    expect(brevo).toEqual([]);
  });
});
