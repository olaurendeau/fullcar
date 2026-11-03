/**
 * The notice « Confirmez votre adresse » of a pending event (epic #581, OA1.7, OA1.10): the
 * address awaiting confirmation, and the result kept of its confirmation email, as the
 * organiser reads it at every load. Pure, and safe in the browser.
 */

/**
 * After this long, a send still « sending » reads as a failure (OA1.7): its function was
 * killed, or the writing of its result failed, and nothing will end it. Brevo is waited for
 * 10 s at most (OA3.6).
 */
export const SENDING_STALE_MS = 30_000;

/**
 * What the notice says of the email: still on its way, sent, failed (abandoned at 10 s
 * included: it may still arrive, decision 10), or stopped by a limit before it went (OA1.9).
 */
export type PendingSend = "sending" | "sent" | "failed" | "addressLimit";

export interface PendingNotice {
  /** The address awaiting confirmation, shown in full so that a typo shows (OA2.1). */
  email: string;
  send: PendingSend;
}

/** What the database keeps of it: `pending_email`, `send_status`, `send_status_at`. */
export interface PendingSendRow {
  email: string | null;
  status: "sending" | "sent" | "failed" | "address_limit" | null;
  at: Date | null;
}

/**
 * The notice of `row` at `now`, or none once nothing awaits confirmation (OA2.6). A
 * `sending` older than SENDING_STALE_MS, or one without a time, is a failure; so is an
 * address without a result: never « Nous avons envoyé » for an email that did not go, never
 * « Envoi du lien… » that does not end (OA1.10).
 */
export function pendingNotice(row: PendingSendRow, now: Date): PendingNotice | undefined {
  if (row.email === null) return undefined;
  const { email, status, at } = row;
  if (status === "sent" || status === "failed") return { email, send: status };
  if (status === "address_limit") return { email, send: "addressLimit" };
  const fresh = status === "sending" && at !== null && now.getTime() - at.getTime() <= SENDING_STALE_MS;
  return { email, send: fresh ? "sending" : "failed" };
}

const SENDS: ReadonlySet<unknown> = new Set<PendingSend>(["sending", "sent", "failed", "addressLimit"]);

/** A notice as the server answers it, its two fields copied by name; anything else is none. */
export function pendingNoticeOf(value: unknown): PendingNotice | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { email, send } = value as { email?: unknown; send?: unknown };
  if (typeof email !== "string" || !SENDS.has(send)) return undefined;
  return { email, send: send as PendingSend };
}
