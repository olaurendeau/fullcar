import { getDb } from "@/db/client";
import { deleteExpiredRows } from "@/db/expired-rows";
import { purgeDayThirty } from "./day-thirty";
import { handlePurge } from "./handle";

/*
 * The daily purge (#589), called by Vercel Cron (`crons` in vercel.json). Only `GET` is
 * exported, as Vercel Cron sends it. `CRON_SECRET` is read at each call: set or changed on
 * Vercel, it holds from the next deployment.
 */
export function GET(request: Request): Promise<Response> {
  return handlePurge(request, process.env.CRON_SECRET, {
    dayThirty: (now) => purgeDayThirty(getDb(), now),
    expiredRows: (now) => deleteExpiredRows(getDb(), now),
  });
}
