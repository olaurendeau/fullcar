import type { Kysely } from "kysely";
import { readMyEventRows } from "@/db/my-events";
import type { Database } from "@/db/schema";
import { findSession } from "@/db/sessions";
import { onOneSnapshot } from "@/db/transaction";
import { listMyEvents, type MyEventsList } from "@/domain/my-events";

/**
 * What /mes-evenements reads once loaded (OA6.1–OA6.8): the session's address, for
 * `MyEvents.signedInAs` and « Mon compte », and its events in their two sections; or
 * `signIn` without a living session, which the page leads to /connexion (OA6.8).
 */
export type MyEventsAnswer = { state: "signIn" } | ({ state: "events"; email: string } & MyEventsList);

/**
 * « Mes événements » for the session whose token `token` is, as it came in the request's
 * body. The session and its events are read on one snapshot; nothing is written, the
 * visit included (session-visit.tsx sends it). The token is only compared, never answered,
 * kept nor logged.
 */
export async function readMyEvents(db: Kysely<Database>, token: unknown, now: Date = new Date()): Promise<MyEventsAnswer> {
  return onOneSnapshot(db, async (trx): Promise<MyEventsAnswer> => {
    const account = await findSession(trx, token, now);
    if (account === undefined) return { state: "signIn" };
    const rows = await readMyEventRows(trx, account.id);
    return { state: "events", email: account.email, ...listMyEvents(rows, account, now) };
  });
}
