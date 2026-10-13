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

  it("leaves a message alone when the URL cannot be parsed, except the URL itself", () => {
    expect(redactConnection("bad url: not a url", "not a url")).toBe("bad url: [redacted]");
  });
});
