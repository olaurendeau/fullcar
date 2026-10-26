import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenMatches } from "@/domain/token-hash";
import { handlePurge, type PurgeSteps } from "./handle";

vi.mock("@/domain/token-hash", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/token-hash")>();
  return { ...actual, tokenMatches: vi.fn(actual.tokenMatches) };
});

const SECRET = "Qz7-cron-4f1d9b2e8a6c0e35";
const NOW = new Date("2026-10-27T03:00:00.000Z");

/** Steps that answer these counts, and record the instant they were run at. */
function steps(): PurgeSteps & { dayThirty: ReturnType<typeof vi.fn>; expiredRows: ReturnType<typeof vi.fn> } {
  return {
    dayThirty: vi.fn(async (now: Date) => (void now, { anonymised: 2, deleted: 3 })),
    expiredRows: vi.fn(async (now: Date) => (void now, { sessions: 4, links: 5, sends: 6 })),
  };
}

/** `GET /api/purge` as Vercel Cron sends it, with `authorization` unless it is undefined. */
function get(authorization: string | undefined, path = "/api/purge") {
  const headers: Record<string, string> = authorization === undefined ? {} : { authorization };
  return new Request(`https://fullcar.example${path}`, { headers });
}

/** Every line written to the console, by any of its methods. */
let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args) => void logs.push(args.map(String).join(" ")));
  }
  vi.mocked(tokenMatches).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The lines the purge may write: fixed words, and numbers in place of `N` (« day 30 » included). */
const LOG_LINES = [
  "purge: day N: N anonymised, N deleted",
  "purge: expired rows: N sessions, N links, N sends",
  "purge: day N failed",
  "purge: expired rows failed",
  "purge: CRON_SECRET is not set",
];

function expectOnlyCounts(lines: string[]) {
  for (const line of lines) expect(LOG_LINES).toContain(line.replace(/\b\d+\b/g, "N").replace(/ \((SQLSTATE|errno) [0-9A-Z -]+\)$/, ""));
  expect(lines.join("\n")).not.toContain(SECRET);
}

describe("with the right secret", () => {
  it("runs day 30, then the clean-up, at the same instant, and answers their counts", async () => {
    const run = steps();
    const response = await handlePurge(get(`Bearer ${SECRET}`), SECRET, run, NOW);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ anonymised: 2, deleted: 3, sessions: 4, links: 5, sends: 6 });
    expect(run.dayThirty.mock.calls).toEqual([[NOW]]);
    expect(run.expiredRows.mock.calls).toEqual([[NOW]]);
  });

  it("logs the counts, and nothing else", async () => {
    await handlePurge(get(`Bearer ${SECRET}`), SECRET, steps(), NOW);

    expect(logs).toEqual(["purge: day 30: 2 anonymised, 3 deleted", "purge: expired rows: 4 sessions, 5 links, 6 sends"]);
    expectOnlyCounts(logs);
  });

  it("still cleans up when day 30 fails, and answers 500, logging the error's code alone", async () => {
    const run = steps();
    const failure = Object.assign(new Error(`connection to ${SECRET} refused`), { code: "57P01" });
    run.dayThirty.mockRejectedValue(failure);

    const response = await handlePurge(get(`Bearer ${SECRET}`), SECRET, run, NOW);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
    expect(run.expiredRows).toHaveBeenCalledOnce();
    expect(logs).toEqual(["purge: day 30 failed (SQLSTATE 57P01)", "purge: expired rows: 4 sessions, 5 links, 6 sends"]);
    expectOnlyCounts(logs);
  });

  it("answers 500 when the clean-up fails, day 30 done", async () => {
    const run = steps();
    run.expiredRows.mockImplementation(() => {
      throw new Error("DATABASE_URL is not set");
    });

    const response = await handlePurge(get(`Bearer ${SECRET}`), SECRET, run, NOW);

    expect(response.status).toBe(500);
    expect(logs).toEqual(["purge: day 30: 2 anonymised, 3 deleted", "purge: expired rows failed"]);
  });
});

describe("refused, with nothing run and nothing answered but 401", () => {
  const refusals: [string, string | undefined][] = [
    ["no Authorization header", undefined],
    ["an empty header", ""],
    ["a wrong secret", "Bearer Qz7-cron-4f1d9b2e8a6c0e36"],
    ["the secret without its scheme", SECRET],
    ["another scheme", `Basic ${SECRET}`],
    ["the secret with one more character", `Bearer ${SECRET}x`],
    ["the secret short of one character", `Bearer ${SECRET.slice(0, -1)}`],
    ["the secret in another case", `Bearer ${SECRET.toUpperCase()}`],
    ["the scheme alone", "Bearer"],
  ];

  it.each(refusals)("%s", async (_, authorization) => {
    const run = steps();
    const response = await handlePurge(get(authorization), SECRET, run, NOW);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(run.dayThirty).not.toHaveBeenCalled();
    expect(run.expiredRows).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it("the secret in the query string, never read there", async () => {
    const run = steps();
    const response = await handlePurge(get(undefined, `/api/purge?secret=${SECRET}&CRON_SECRET=${SECRET}`), SECRET, run, NOW);

    expect(response.status).toBe(401);
    expect(run.dayThirty).not.toHaveBeenCalled();
  });

  it.each([
    ["not set", undefined],
    ["empty", ""],
    ["blank", "   "],
  ])("CRON_SECRET %s, whatever the header says, and the log says so without a value", async (_, secret) => {
    for (const authorization of [undefined, "", "Bearer", "Bearer undefined", `Bearer ${secret ?? ""}`, `Bearer ${SECRET}`]) {
      const run = steps();
      const response = await handlePurge(get(authorization), secret, run, NOW);

      expect(response.status).toBe(401);
      expect(run.dayThirty).not.toHaveBeenCalled();
      expect(run.expiredRows).not.toHaveBeenCalled();
    }
    expect(new Set(logs)).toEqual(new Set(["purge: CRON_SECRET is not set"]));
    expectOnlyCounts(logs);
  });
});

describe("the comparison", () => {
  it("goes through the constant-time comparison of tokens, whatever the length of the header", async () => {
    for (const authorization of [`Bearer ${SECRET}`, "Bearer x", `Bearer ${SECRET}${"x".repeat(500)}`, undefined]) {
      await handlePurge(get(authorization), SECRET, steps(), NOW);
    }

    expect(vi.mocked(tokenMatches).mock.results.map((result) => result.value)).toEqual([true, false, false, false]);
  });
});
