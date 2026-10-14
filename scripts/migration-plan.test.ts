import { describe, expect, it, vi } from "vitest";
import { planMigration, redactConnection } from "./migration-plan";

// Made-up URLs shaped like Neon's, its query included: nothing here reaches a real database.
const neonQuery = "?sslmode=require&channel_binding=require";
const unpooled = `postgres://alice:s3cr%40t@ep-direct-42.eu-central-1.aws.example/appdb${neonQuery}`;
const pooled = `postgres://alice:s3cr%40t@ep-direct-42-pooler.eu-central-1.aws.example/appdb${neonQuery}`;
const WITHHELD = "[error withheld: its connection string could not be read safely]";

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

  // Postgres quotes pieces of options in ways no redaction keeps up with (each reproduced
  // against a slot database during review): any query key but Neon's withholds the message.
  it.each([
    ["-c%20statement_timeout%3Dsecretval", 'invalid value for parameter "statement_timeout": "secretval"'],
    ["-c%20statement_timeout%3Dse%5Ccr%5Cet", 'invalid value for parameter "statement_timeout": "secret"'],
    ["-c%20local_preload_libraries%3D%5C%20secretlib", 'could not access file "$libdir/plugins/secretlib"'],
    ["-c%20statement_timeout%3Dsec%3Dret", 'invalid value for parameter "statement_timeout": "sec=ret"'],
    ["-c%20local_preload_libraries%3D%22secret%22%22lib%22", 'could not access file "secret"lib"'],
    ["endpoint%3Dep-direct-42", "invalid command-line argument for server process: endpoint=ep-direct-42"],
  ])("withholds the whole message when the URL carries options=%s", (options, message) => {
    expect(redactConnection(`error: ${message}`, `postgres://alice:pw@db/appdb?options=${options}`)).toBe(WITHHELD);
  });

  it.each([
    ["application_name=ci%20jobsecret", 'application "ci jobsecret" failed'],
    ["user=alicesecret&password=wrongpw", 'password authentication failed for user "alicesecret" (wrongpw)'],
    ["sslmode=verify-full&sslrootcert=/secret-ca-path.pem", "ENOENT: no such file or directory, open '/secret-ca-path.pem'"],
    ["sslcert=%2Fsecret%2Fclient.crt", "ENOENT: no such file or directory, open '/secret/client.crt'"],
    ["sslkey=/secret/client.key", "ENOENT: no such file or directory, open '/secret/client.key'"],
    ["host=db", 'database "appdb" does not exist'],
    ["db=secretdb", 'database "secretdb" does not exist'],
  ])("withholds the whole message when the URL carries a query key outside Neon's: %s", (query, message) => {
    expect(redactConnection(`error: ${message}`, `postgres://db:5432/appdb?${query}`)).toBe(WITHHELD);
  });

  it.each([
    ["sslmode=secretmode"],
    ["sslmode=require&sslmode=secretmode"],
    ["channel_binding=verify-full"],
    ["sslmode"],
    ["connect_timeout=abc"],
    ["connect_timeout=10s"],
    ["connect_timeout="],
  ])("withholds the whole message when an allowed key has an unexpected value: %s", (query) => {
    expect(redactConnection("error: failed with secretmode abc 10s", `postgres://db/appdb?${query}`)).toBe(WITHHELD);
  });

  it.each([
    ...["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].map((mode) => `sslmode=${mode}`),
    ...["disable", "prefer", "require"].map((binding) => `channel_binding=${binding}`),
    "connect_timeout=10",
  ])("leaves the values of %s readable", (query) => {
    const value = query.slice(query.indexOf("=") + 1);
    const message = `error: relation "cars" already exists (${value})\n    at parser.js:283:10`;
    expect(redactConnection(message, `postgres://alice:pw@db/appdb?${query}`)).toBe(message);
  });

  it("removes the host's first label on its own, keeping the port", () => {
    const message = "endpoint ep-direct-42 not found; TLS: eu-central-1.aws.example; port 5432";
    const redacted = redactConnection(message, "postgres://alice:s3cret@ep-direct-42.eu-central-1.aws.example:5432/appdb");
    expect(redacted).not.toContain("ep-direct-42");
    expect(redacted).toContain("port 5432");
  });

  // Forms that pg reads although new URL() alone rejects or misreads them (see pg-connection-string).
  it.each([
    ["no host", "postgres://alicesecret:wrongpw@/secretdb"],
    ["a socket: URL", "socket://alicesecret:wrongpw@/secretdb"],
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

  // new URL and pg drop tabs and newlines anywhere, so they must not hide the delimiter.
  it.each([["postgres:\t//u:12345/ab@host/db"], ["postgres:/\n/u:12345/ab@host/db"], ["postgres:/\r/u:12345?ab@host/db"]])(
    "withholds the whole message when a tab or newline hides the delimiter: %j",
    (url) => {
      const redacted = redactConnection("connect ECONNREFUSED u:12345, user ab", url);
      for (const secret of ["12345", "ab"]) expect(redacted).not.toContain(secret);
    },
  );

  it("redacts a 40 KB password without printing it", () => {
    const password = "SECRETPW".repeat(5000);
    const url = `postgres://fullcar:${password}@db:5432/fullcar`;
    const redacted = redactConnection(`connect to ${url} failed: password ${password} rejected`, url);
    expect(redacted).not.toContain("SECRETPW");
    expect(redacted).toContain("rejected");
  });

  it("covers the widest stretch where secrets overlap, leaving no piece of either", () => {
    const url = "postgres://npg_sec:secretABC@host/appdb";
    expect(redactConnection("auth npg_secretABC failed", url)).toBe("auth [redacted] failed");
  });

  it("replaces in a single pass, never inside a marker it has just written", () => {
    expect(redactConnection("host: a", "postgres://u:a@host/appdb")).toBe("[redacted]: [redacted]");
  });

  it.each([
    ["as a -pooler host", pooled],
    ["in a password, as Neon accepts it", "postgres://alice:endpoint%3Dep-direct-42%24pw@db/appdb"],
    ["in a user name", "postgres://ep-direct-42%24alice:pw@db/appdb"],
  ])("removes a bare Neon endpoint id %s", (_where, url) => {
    const redacted = redactConnection("endpoint ep-direct-42 is disabled", url);
    expect(redacted).not.toContain("ep-direct-42");
    expect(redacted).toContain("is disabled");
  });

  it.each([
    ["direct", unpooled],
    ["pooled", pooled],
    ["with a connect timeout", `${pooled}&connect_timeout=10`],
  ])("leaves an ordinary SQL error untouched (%s Neon URL)", (_form, url) => {
    const message = [
      'error: relation "cars" already exists',
      "    at Parser.parseErrorMessage (/app/node_modules/pg-protocol/dist/parser.js:283:98)",
    ].join("\n");
    expect(redactConnection(message, url)).toBe(message);
  });

  it("withholds the whole message when redacting throws, even with the URL in the error", () => {
    const url = "postgres://alice:wrongpw@db/appdb";
    const indexOf = vi.spyOn(String.prototype, "indexOf").mockImplementationOnce(() => {
      throw new Error(url);
    });
    try {
      const redacted = redactConnection(`password authentication failed (wrongpw) via ${url}`, url);
      expect(indexOf).toHaveBeenCalled();
      expect(redacted).toBe("[error withheld: its connection string could not be read safely]");
    } finally {
      indexOf.mockRestore();
    }
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
