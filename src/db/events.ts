import { sql, type Kysely, type Selectable } from "kysely";
import type { NewEvent } from "@/domain/event";
import type { OrganiserAccessEvent } from "@/domain/organiser-access";
import type { PendingSendRow } from "@/domain/pending-send";
import { generatePublicId } from "@/domain/public-id";
import type { TransferRow } from "@/domain/transfer";
import type { Database, EventTable } from "./schema";
import { tokenKey } from "./token-key";

/**
 * Ids drawn before giving up. With 57⁸ ids, even one collision is rare: several in a row
 * mean a broken generator, and looping on it would only hold the request open.
 */
export const INSERT_ATTEMPTS = 5;

/**
 * Stores the event under a new public id and returns that id. A taken id is not an error:
 * the insert does nothing (no failed statement, so a surrounding transaction survives),
 * and a new id is drawn.
 * `adminTokenHash` is the domain's lowercase hex SHA-256: stored as its 32 bytes.
 */
export async function insertEvent(
  db: Kysely<Database>,
  event: NewEvent,
  adminTokenHash: string,
  newId: () => string = generatePublicId,
): Promise<string> {
  for (let attempt = 0; attempt < INSERT_ATTEMPTS; attempt++) {
    const inserted = await db
      .insertInto("event")
      .values({
        id: newId(),
        title: event.title,
        location: event.location,
        location_lat: event.locationPosition?.lat ?? null,
        location_lng: event.locationPosition?.lng ?? null,
        aller_at: event.allerAt,
        retour_at: event.retourAt,
        description: event.description,
        boosters_enabled: event.boostersEnabled,
        participation_enabled: event.participationEnabled,
        stops_enabled: event.stopsEnabled,
        admin_token_hash: Buffer.from(adminTokenHash, "hex"),
      })
      .onConflict((conflict) => conflict.column("id").doNothing())
      .returning("id")
      .executeTakeFirst();
    if (inserted) return inserted.id;
  }
  throw new Error(`insertEvent: no free id after ${INSERT_ATTEMPTS} attempts`);
}

/**
 * The stored hash of the event's admin token, in lowercase hex; `null` for an event without
 * a token (revoked, #586), which no token matches; nothing for an unknown id.
 */
export async function readAdminTokenHash(db: Kysely<Database>, id: string): Promise<string | null | undefined> {
  const row = await db.selectFrom("event").select("admin_token_hash").where("id", "=", id).executeTakeFirst();
  if (row === undefined) return undefined;
  return row.admin_token_hash?.toString("hex") ?? null;
}

/**
 * Revokes the admin tokens of `tokens`, as they came in a request's body (OA9.1, « Se
 * déconnecter »): each event whose token is one of them has its hash set to null, which no
 * token matches. A value that is not a string matches nothing. The events are locked in id
 * order first, as `lockEvent` locks one: a write of the organiser that waited on one then reads
 * the token revoked. Gives how many were revoked. Never log a token, nor its hash.
 */
export async function revokeAdminTokens(db: Kysely<Database>, tokens: readonly unknown[]): Promise<number> {
  const keys = tokens.map(tokenKey).filter((key): key is Buffer => key !== null);
  if (keys.length === 0) return 0;
  const held = await db
    .selectFrom("event")
    .select("id")
    .where("admin_token_hash", "in", keys)
    .orderBy("id")
    .forNoKeyUpdate()
    .execute();
  if (held.length === 0) return 0;
  const ids = held.map((row) => row.id);
  const revoked = await db.updateTable("event").set({ admin_token_hash: null }).where("id", "in", ids).executeTakeFirst();
  return Number(revoked.numUpdatedRows);
}

/**
 * What the organiser-access rule reads of the event (organiser-access.ts): its account, whether
 * it was confirmed and anonymised, and its admin token's hash in lowercase hex, `null` once
 * revoked. Nothing for an unknown id. Never sent to a browser.
 */
export async function readOrganiserAccessEvent(db: Kysely<Database>, id: string): Promise<OrganiserAccessEvent | undefined> {
  const row = await db
    .selectFrom("event")
    .select(["id", "account_id", "confirmed_at", "anonymised_at", "admin_token_hash"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (row === undefined) return undefined;
  return {
    id: row.id,
    accountId: row.account_id,
    confirmed: row.confirmed_at !== null,
    anonymised: row.anonymised_at !== null,
    adminTokenHash: row.admin_token_hash?.toString("hex") ?? null,
  };
}

/**
 * The address awaiting confirmation and the result kept of its email (OA1.7), for the notice
 * of the organiser's panel only: never read before the access is granted. Nothing for an
 * unknown id.
 */
export async function readPendingSend(db: Kysely<Database>, id: string): Promise<PendingSendRow | undefined> {
  const row = await db
    .selectFrom("event")
    .select(["pending_email", "send_status", "send_status_at"])
    .where("id", "=", id)
    .executeTakeFirst();
  return row && { email: row.pending_email, status: row.send_status, at: row.send_status_at };
}

/**
 * What anyone holding the public link may read, listed one by one: a column added to the
 * table stays private until it is added here. Never `admin_token_hash`.
 * `anonymised_at` is: the link of an anonymised event says « Événement terminé » to anyone (#590).
 */
const PUBLIC_EVENT_COLUMNS = [
  "id",
  "title",
  "location",
  "location_lat",
  "location_lng",
  "aller_at",
  "retour_at",
  "description",
  "boosters_enabled",
  "participation_enabled",
  "stops_enabled",
  "anonymised_at",
] as const;

export type PublicEvent = Pick<Selectable<EventTable>, (typeof PUBLIC_EVENT_COLUMNS)[number]>;

/** The event's public fields; nothing for an unknown id. The id is compared as is: case counts. */
export async function findEventById(db: Kysely<Database>, id: string): Promise<PublicEvent | undefined> {
  return db.selectFrom("event").select(PUBLIC_EVENT_COLUMNS).where("id", "=", id).executeTakeFirst();
}

/**
 * The row lock `lockEvent` takes. `share` for a write on a leg: such writes do not wait for
 * each other. `noKeyUpdate` for a change of the event's fields: it waits for the writes on
 * the legs under way, and they wait for it.
 */
export type EventLock = "share" | "noKeyUpdate";

/** The event as `lockEvent` gives it. */
export type LockedEvent = PublicEvent & Pick<Selectable<EventTable>, "account_id">;

/**
 * `SELECT … FOR SHARE`, or `FOR NO KEY UPDATE`, on the event, held until the transaction
 * ends: the first lock of every write on a leg (lock order: Event, then Ride, then Person).
 * Under READ COMMITTED, a lock obtained after waiting gives the row as committed: a write
 * that waited for the removal of the retour sees `retour_at` null (M3.6), and one that waited
 * for the purge sees `anonymised_at` (#588). Gives the public fields, and what a write decides
 * on under the lock: its account and when it was anonymised. Nothing for an unknown event.
 * Outside a transaction the lock ends with the statement: call it inside `atomically`.
 */
export async function lockEvent(db: Kysely<Database>, id: string, lock: EventLock): Promise<LockedEvent | undefined> {
  const query = db
    .selectFrom("event")
    .select([...PUBLIC_EVENT_COLUMNS, "account_id"])
    .where("id", "=", id);
  return (lock === "share" ? query.forShare() : query.forNoKeyUpdate()).executeTakeFirst();
}

/**
 * `SELECT … FOR KEY SHARE` on the event, until the transaction ends: it cannot be deleted
 * before a row that refers to it is written, and no write on it waits (a sign-in link's
 * return target, OA4.4). Whether the event exists. Taken before the address, like lockEvent.
 */
export async function holdEventKey(db: Kysely<Database>, id: string): Promise<boolean> {
  const row = await db.selectFrom("event").select("id").where("id", "=", id).forKeyShare().executeTakeFirst();
  return row !== undefined;
}

/**
 * What the organiser changes: the token is not among them, nor the options but « Points de RDV »
 * (`stops`, D1). Without `locationPosition`, the position stored stays as it is; without
 * `description`, the description stored does; without `stops`, the option does.
 */
export type EventFieldsChange = Pick<NewEvent, "title" | "location" | "allerAt" | "retourAt"> &
  Partial<Pick<NewEvent, "locationPosition" | "description">> & { stops?: boolean };

/**
 * Whether the event existed, and now has these fields. A retour removed has its Rides and
 * Placements deleted first, in the same transaction, under `lockEvent(…, "noKeyUpdate")`
 * (`removeRetour`): no row of the retour stays under a `retour_at` null.
 */
export async function writeEventFields(db: Kysely<Database>, id: string, fields: EventFieldsChange): Promise<boolean> {
  const { locationPosition: position, description, stops } = fields;
  const result = await db
    .updateTable("event")
    .set({ title: fields.title, location: fields.location, aller_at: fields.allerAt, retour_at: fields.retourAt })
    .$if(position !== undefined, (update) =>
      update.set({ location_lat: position?.lat ?? null, location_lng: position?.lng ?? null }),
    )
    .$if(description !== undefined, (update) => update.set({ description }))
    .$if(stops !== undefined, (update) => update.set({ stops_enabled: stops }))
    .where("id", "=", id)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/**
 * Who a new event is for (#599), written in the transaction that creates it: the account of
 * a live session, confirmed at once (OA1.3), or by the use of its confirmation link (OA5.3),
 * which clears the address and the result kept; or an address awaiting confirmation, with the
 * first result of its email: `sending` once the send is recorded, `address_limit` when the
 * limit of the address or the global cap stopped it (OA1.9, decision of the review of #623).
 */
export type EventOwner =
  | { accountId: string; confirmedAt: Date }
  | { pendingEmail: string; sendStatus: "sending" | "address_limit"; sendStatusAt: Date };

export async function writeEventOwner(db: Kysely<Database>, id: string, owner: EventOwner): Promise<void> {
  const columns =
    "accountId" in owner
      ? // Confirmed: no address awaits, and no email is left to report on.
        { account_id: owner.accountId, confirmed_at: owner.confirmedAt, pending_email: null, send_status: null, send_status_at: null }
      : { pending_email: owner.pendingEmail, send_status: owner.sendStatus, send_status_at: owner.sendStatusAt };
  await db.updateTable("event").set(columns).where("id", "=", id).execute();
}

/**
 * The result of the confirmation email once Brevo has answered (OA1.7), written only over
 * the `sending` this send wrote at `since`: a status written since, by a resend or a
 * confirmation, is left as it is. Says whether it was written.
 */
export async function writeSendResult(
  db: Kysely<Database>,
  id: string,
  since: Date,
  result: "sent" | "failed",
): Promise<boolean> {
  const written = await db
    .updateTable("event")
    .set({ send_status: result, send_status_at: new Date() })
    .where("id", "=", id)
    .where("send_status", "=", "sending")
    .where("send_status_at", "=", since)
    .executeTakeFirst();
  return Number(written.numUpdatedRows) > 0;
}

/**
 * The address the event is being handed to, the result kept of its email, and the date of the
 * most recent transfer link (epic #935, OT2.2), read in one statement, for the notice of the
 * organiser's panel and the list of Mes événements only: never read before the access is
 * granted. Nothing for an unknown id; an event that is not being handed over gives an empty row.
 */
export async function readTransfer(db: Kysely<Database>, id: string): Promise<TransferRow | undefined> {
  const row = await db
    .selectFrom("event")
    .select([
      "transfer_email",
      "transfer_status",
      "transfer_status_at",
      (eb) =>
        eb
          .selectFrom("email_link")
          .select(sql<Date | null>`max(created_at)`.as("created_at"))
          .whereRef("email_link.event_id", "=", "event.id")
          .where("email_link.kind", "=", "transfer")
          .as("last_link_at"),
    ])
    .where("id", "=", id)
    .executeTakeFirst();
  return (
    row && { email: row.transfer_email, status: row.transfer_status, at: row.transfer_status_at, lastLinkAt: row.last_link_at }
  );
}

/**
 * Hands the event over to `email` (OT1.5, OT2.7): the address, with the first result of its
 * email, `sending` once the send is recorded or `address_limit` when the limit of the address
 * or the global cap stopped it (OT1.6). It replaces the handover that waited. Under
 * `lockEvent(…, "noKeyUpdate")`, in the transaction of `claimTransfer`; the database refuses an
 * event that is pending, anonymised or without account (`event_transfer_open`). The account and
 * the admin token stay as they are.
 */
export async function writeTransfer(
  db: Kysely<Database>,
  id: string,
  transfer: { email: string; status: "sending" | "address_limit"; at: Date },
): Promise<void> {
  await db
    .updateTable("event")
    .set({ transfer_email: transfer.email, transfer_status: transfer.status, transfer_status_at: transfer.at })
    .where("id", "=", id)
    .execute();
}

/**
 * The result of the transfer email once Brevo has answered, written only over the `sending`
 * this send wrote at `since`, as `writeSendResult` does: a handover replaced, cancelled or
 * stopped since leaves it as it is. Says whether it was written.
 */
export async function writeTransferResult(
  db: Kysely<Database>,
  id: string,
  since: Date,
  result: "sent" | "failed",
): Promise<boolean> {
  const written = await db
    .updateTable("event")
    .set({ transfer_status: result, transfer_status_at: new Date() })
    .where("id", "=", id)
    .where("transfer_status", "=", "sending")
    .where("transfer_status_at", "=", since)
    .executeTakeFirst();
  return Number(written.numUpdatedRows) > 0;
}

/**
 * Ends the handover without giving the event away (OT2.5): the address and its result are
 * cleared. Says whether one was waiting. Its links are deleted with `deleteTransferLinks`, in
 * the same transaction.
 */
export async function clearTransfer(db: Kysely<Database>, id: string): Promise<boolean> {
  const cleared = await db
    .updateTable("event")
    .set({ transfer_email: null, transfer_status: null, transfer_status_at: null })
    .where("id", "=", id)
    .where("transfer_email", "is not", null)
    .executeTakeFirst();
  return Number(cleared.numUpdatedRows) > 0;
}
