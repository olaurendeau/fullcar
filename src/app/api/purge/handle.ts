/**
 * `GET /api/purge` (#589, « La purge » in architecture.md), called once a day by Vercel Cron
 * with `Authorization: Bearer {CRON_SECRET}`. The secret is read from that header alone, never
 * from the URL, and compared in constant time; without it, or without a `CRON_SECRET`, nothing
 * runs. The log carries counts and fixed words only: never the secret, nor a row.
 */
import type { ExpiredRowCounts } from "@/db/expired-rows";
import { databaseFailure } from "@/db/failure";
import { hashToken, tokenMatches } from "@/domain/token-hash";
import type { DayThirtyCounts } from "./day-thirty";

/** What a run does, at one instant: day 30, then the clean-up of the expired rows. */
export interface PurgeSteps {
  dayThirty: (now: Date) => Promise<DayThirtyCounts>;
  expiredRows: (now: Date) => Promise<ExpiredRowCounts>;
}

const HEADERS = { "Cache-Control": "no-store" };

/**
 * Whether the header is `Bearer {secret}`. Both sides are hashed to 32 bytes and compared by
 * `tokenMatches`, the code's one constant-time comparison: the time says nothing of the
 * length of the secret, nor of where the header differs from it.
 */
function authorised(header: string | null, secret: string): boolean {
  return tokenMatches(header ?? "", hashToken(`Bearer ${secret}`));
}

/** Runs one step; on failure, logs its name and the error's code alone, and gives `undefined`. */
async function attempt<T>(name: string, step: () => Promise<T>): Promise<T | undefined> {
  try {
    return await step();
  } catch (error) {
    databaseFailure(`purge: ${name} failed`, error);
    return undefined;
  }
}

/** 401 without the right secret; otherwise both steps, even when the first fails: 200 with their counts, or 500. */
export async function handlePurge(
  request: Request,
  secret: string | undefined,
  steps: PurgeSteps,
  now: Date = new Date(),
): Promise<Response> {
  if (secret === undefined || secret.trim() === "") {
    console.error("purge: CRON_SECRET is not set");
    return new Response(null, { status: 401, headers: HEADERS });
  }
  if (!authorised(request.headers.get("authorization"), secret)) {
    return new Response(null, { status: 401, headers: HEADERS });
  }

  const dayThirty = await attempt("day 30", () => steps.dayThirty(now));
  if (dayThirty) console.info(`purge: day 30: ${dayThirty.anonymised} anonymised, ${dayThirty.deleted} deleted`);
  const expired = await attempt("expired rows", () => steps.expiredRows(now));
  if (expired) console.info(`purge: expired rows: ${expired.sessions} sessions, ${expired.links} links, ${expired.sends} sends`);

  if (!dayThirty || !expired) return new Response(null, { status: 500, headers: HEADERS });
  return Response.json({ ...dayThirty, ...expired }, { status: 200, headers: HEADERS });
}
