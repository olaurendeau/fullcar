import { hashAdminToken } from "@/domain/admin-token";
import { readAdminTokenHash } from "@/db/events";
import { e2eDatabaseUrl, expect, test } from "./fixtures";

test.describe("seededEvent", () => {
  test("is stored in the slot's database, and reads back from the e2e container", async ({ db, seededEvent }) => {
    const row = await db
      .selectFrom("event")
      .select(["title", "aller_at"])
      .where("id", "=", seededEvent.id)
      .executeTakeFirst();
    expect(row).toEqual({ title: "Tournoi de Rennes", aller_at: "2026-12-12 07:30:00" });
    expect(await readAdminTokenHash(db, seededEvent.id)).toBe(hashAdminToken(seededEvent.token));
  });
});

test.describe("seededEvent, once its test is over", () => {
  // Serial: the second test looks for the first one's event.
  test.describe.configure({ mode: "serial" });
  let previous: string | undefined;

  test("is seeded for one test", async ({ seededEvent }) => {
    previous = seededEvent.id;
  });

  test("is deleted", async ({ db }) => {
    expect(previous).toBeDefined();
    expect(await readAdminTokenHash(db, previous!)).toBeUndefined();
  });
});

test.describe("e2eDatabaseUrl", () => {
  test("accepts the slot's database, at db", () => {
    const url = "postgres://fullcar:fullcar@db:5432/fullcar";
    expect(e2eDatabaseUrl(url)).toBe(url);
  });

  test("refuses a missing URL", () => {
    expect(() => e2eDatabaseUrl(undefined)).toThrow("DATABASE_URL is not set");
  });

  test("refuses any other host, without echoing the URL", () => {
    const url = "postgres://fullcar:fullcar@elsewhere.example:5432/fullcar";
    expect(() => e2eDatabaseUrl(url)).toThrow(/^e2e: DATABASE_URL must reach the database fullcar at host db$/);
  });

  // pg reads a host, a port or a socket from more than the URL's host part: anything
  // beyond `postgres://…@db[:port]/fullcar` is refused, whatever pg would make of it.
  for (const [what, url] of [
    ["a host in the query string", "postgres://fullcar:fullcar@db:5432/fullcar?host=elsewhere.example"],
    ["a port in the query string", "postgres://fullcar:fullcar@db/fullcar?port=6543"],
    ["any query string", "postgres://fullcar:fullcar@db:5432/fullcar?sslmode=disable"],
    ["an empty query string", "postgres://fullcar:fullcar@db:5432/fullcar?"],
    ["a fragment", "postgres://fullcar:fullcar@db:5432/fullcar#elsewhere"],
    ["several hosts", "postgres://fullcar:fullcar@db,elsewhere.example:5432/fullcar"],
    ["a socket URL", "socket://fullcar:fullcar@/var/run/postgresql?db=fullcar"],
    ["a socket path", "/var/run/postgresql fullcar"],
    ["an encoded socket host", "postgres://fullcar:fullcar@%2Fvar%2Frun%2Fpostgresql/fullcar"],
    ["db as the user only", "postgres://db@elsewhere.example/fullcar"],
    ["another scheme", "http://fullcar:fullcar@db:5432/fullcar"],
  ]) {
    test(`refuses ${what}, without echoing the URL`, () => {
      expect(() => e2eDatabaseUrl(url)).toThrow(/^e2e: DATABASE_URL must reach the database fullcar at host db$/);
    });
  }

  test("refuses another database at db", () => {
    expect(() => e2eDatabaseUrl("postgres://fullcar:fullcar@db:5432/fullcar_test")).toThrow(
      "must reach the database fullcar at host db",
    );
  });
});
