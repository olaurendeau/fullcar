import { describe, expect, it } from "vitest";
import { planMigration, redactConnection } from "./migration-plan";

// A made-up URL shaped like Neon's: nothing here reaches a real database.
const unpooled = "postgres://alice:s3cr%40t@ep-direct-42.eu-central-1.aws.example/appdb?sslmode=require";
const pooled = "postgres://alice:s3cr%40t@ep-direct-42-pooler.eu-central-1.aws.example/appdb";

describe("planMigration on a Vercel build (deploy)", () => {
  it("migrates production to latest through the unpooled URL", () => {
    const env = { VERCEL_ENV: "production", DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: unpooled };
    expect(planMigration("deploy", env)).toEqual({
      action: "migrate",
      command: "latest",
      variable: "DATABASE_URL_UNPOOLED",
    });
  });

  it("falls back to DATABASE_URL in production when the unpooled URL is missing or empty", () => {
    for (const DATABASE_URL_UNPOOLED of [undefined, ""]) {
      const env = { VERCEL_ENV: "production", DATABASE_URL: pooled, DATABASE_URL_UNPOOLED };
      expect(planMigration("deploy", env)).toMatchObject({ action: "migrate", variable: "DATABASE_URL" });
    }
  });

  it("fails in production when no URL is set, naming the variables only", () => {
    expect(() => planMigration("deploy", { VERCEL_ENV: "production", DATABASE_URL: "" })).toThrow(
      "Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set",
    );
  });

  it.each([["preview"], ["development"], [undefined], [""]])(
    "skips when VERCEL_ENV is %j, even with a URL at hand",
    (VERCEL_ENV) => {
      const env = { VERCEL_ENV, DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: unpooled };
      expect(planMigration("deploy", env)).toMatchObject({ action: "skip" });
    },
  );

  it("skips a preview that has no database at all", () => {
    expect(planMigration("deploy", { VERCEL_ENV: "preview" })).toMatchObject({ action: "skip" });
  });
});

describe("planMigration from make migrate", () => {
  it.each([["latest"], ["up"], ["down"], ["reset"]])("runs %s whatever VERCEL_ENV says", (command) => {
    expect(planMigration(command, { DATABASE_URL: pooled })).toEqual({
      action: "migrate",
      command,
      variable: "DATABASE_URL",
    });
  });

  it("prefers the unpooled URL there too", () => {
    const env = { DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: unpooled };
    expect(planMigration("latest", env)).toMatchObject({ variable: "DATABASE_URL_UNPOOLED" });
  });

  it("fails without any URL", () => {
    expect(() => planMigration("latest", {})).toThrow("Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set");
  });

  it("rejects an unknown command", () => {
    expect(() => planMigration("drop", { DATABASE_URL: pooled })).toThrow('Unknown command "drop"');
  });
});

describe("redactConnection", () => {
  const secrets = ["s3cr@t", "s3cr%40t", "alice", "ep-direct-42.eu-central-1.aws.example", "appdb"];

  it("removes the whole URL and each of its parts from a message", () => {
    const message = [
      `connect to ${unpooled} failed`,
      "getaddrinfo ENOTFOUND ep-direct-42.eu-central-1.aws.example",
      'password authentication failed for user "alice" (s3cr@t)',
      'database "appdb" does not exist',
    ].join("\n");
    const redacted = redactConnection(message, unpooled);
    for (const secret of secrets) expect(redacted).not.toContain(secret);
    expect(redacted).toContain("getaddrinfo ENOTFOUND");
  });

  it("removes the values of the query string, raw and decoded", () => {
    const url = "postgres://db:5432/fullcar?options=endpoint%3Dep-direct-42&user=bob&sslrootcert=%2Fsecret-ca-path.pem";
    const message = [
      "unknown option endpoint%3Dep-direct-42 (endpoint=ep-direct-42)",
      'password authentication failed for user "bob"',
      "ENOENT: no such file or directory, open '/secret-ca-path.pem'",
    ].join("\n");
    const redacted = redactConnection(message, url);
    for (const secret of ["endpoint%3Dep-direct-42", "endpoint=ep-direct-42", "bob", "/secret-ca-path.pem"]) {
      expect(redacted).not.toContain(secret);
    }
    expect(redacted).toContain("ENOENT: no such file or directory");
  });

  // Both reproduced against a slot database during review.
  it.each([
    [
      "postgres://db:5432/fullcar?user=alicesecret&password=wrongpw",
      'error: password authentication failed for user "alicesecret" (wrongpw)',
      ["alicesecret", "wrongpw"],
    ],
    [
      "postgres://db:5432/fullcar?sslmode=verify-full&sslrootcert=/secret-ca-path.pem",
      "ENOENT: no such file or directory, open '/secret-ca-path.pem'",
      ["/secret-ca-path.pem"],
    ],
  ])("removes credentials passed as parameters: %s", (url, message, secrets) => {
    const redacted = redactConnection(message, url);
    for (const secret of secrets) expect(redacted).not.toContain(secret);
  });

  it("removes the host's first label on its own, keeping the port", () => {
    const message = "endpoint ep-direct-42 not found; TLS: eu-central-1.aws.example; port 5432";
    const redacted = redactConnection(message, "postgres://alice:s3cret@ep-direct-42.eu-central-1.aws.example:5432/appdb");
    expect(redacted).not.toContain("ep-direct-42");
    expect(redacted).toContain("port 5432");
  });

  // Forms that pg reads although new URL() alone rejects or misreads them (see pg-connection-string).
  it.each([
    ["no host, the server named by a parameter", "postgres://alicesecret:wrongpw@/secretdb?host=db"],
    ["a socket: URL", "socket://alicesecret:wrongpw@/var/run/secretdb?db=secretdb"],
  ])("removes every part of a URL with %s", (_form, url) => {
    const message = [
      'password authentication failed for user "alicesecret" (wrongpw)',
      'database "secretdb" does not exist',
      "connect ENOENT /var/run/alicesecret/.s.PGSQL.5432",
    ].join("\n");
    const redacted = redactConnection(message, url);
    for (const secret of ["alicesecret", "wrongpw", "secretdb"]) expect(redacted).not.toContain(secret);
    expect(redacted).toContain("password authentication failed for user");
  });

  it("removes the directory and the database of pg's socket form", () => {
    const message = 'connect ENOENT /var/run/pgsecret/.s.PGSQL.5432\ndatabase "secretdb" does not exist';
    const redacted = redactConnection(message, "/var/run/pgsecret secretdb");
    for (const secret of ["pgsecret", "secretdb"]) expect(redacted).not.toContain(secret);
    expect(redacted).toContain("does not exist");
  });

  it("removes a bracketed IPv6 host as pg quotes it, without brackets", () => {
    const redacted = redactConnection("connect ECONNREFUSED fd00::42:5432", "postgres://alice:pw@[fd00::42]:5432/appdb");
    expect(redacted).not.toContain("fd00::42");
  });

  it("removes the password as pg reads it after re-encoding a stray %", () => {
    const redacted = redactConnection("rejected password 50%2Ax", "postgres://alice:50%2%41x@db/appdb");
    expect(redacted).not.toContain("50%2Ax");
  });

  // new URL ends the authority at the first / ? or #, and would read "12" as the port.
  it.each([["postgres://u:12/ab@host/db"], ["postgres://u:12?ab@host/db"], ["postgres://u:12#ab@host/db"]])(
    "withholds the whole message when the password holds an unencoded delimiter: %s",
    (url) => {
      const redacted = redactConnection("connect ECONNREFUSED u:12, user ab", url);
      for (const secret of ["12", "ab"]) expect(redacted).not.toContain(secret);
    },
  );

  it("replaces in a single pass, never inside a marker it has just written", () => {
    expect(redactConnection("host: a", "postgres://host/appdb?application_name=a")).toBe("[redacted]: [redacted]");
  });

  it.each([
    ["not a URL", "not a url"],
    ["a relative reference pg would resolve", "db/secretdb?user=alicesecret&password=wrongpw"],
    ["a scheme that is not PostgreSQL's", "alicesecret:wrongpw@db/secretdb"],
    ["an opaque path", "postgres:secretdb"],
    ["an empty string", ""],
  ])("withholds the whole message when the URL is %s", (_form, url) => {
    const redacted = redactConnection('password authentication failed for user "alicesecret" (wrongpw) on secretdb', url);
    for (const secret of ["alicesecret", "wrongpw", "secretdb", "authentication"]) {
      expect(redacted).not.toContain(secret);
    }
  });
});
