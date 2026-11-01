/**
 * The notice of a handover in progress (epic #935, OT2.2, OT2.6): the address the event is
 * being handed to, and what became of the email that carries the link, as the organiser reads
 * it at every load. The model is pending-send.ts's. Pure, and safe in the browser.
 */
import { linkExpiresAt } from "./account-rules";
import { emailAddress } from "./email-address";
import { SENDING_STALE_MS } from "./pending-send";

/**
 * What the notice says: the email still on its way, sent, failed (abandoned at 10 s included:
 * it may still arrive), stopped by the limit of the address before it went (OT1.6), or sent
 * but with a link that is no longer valid (OT2.6).
 */
export type TransferSend = "sending" | "sent" | "failed" | "addressLimit" | "expired";

export interface TransferNotice {
  /** The recipient's address, shown in full so that a typo shows. */
  email: string;
  send: TransferSend;
}

/**
 * What the notice reads: `transfer_email`, `transfer_status`, `transfer_status_at` of the
 * event, and the creation date of its most recent handover link (`null` when it has none).
 */
export interface TransferRow {
  email: string | null;
  status: "sending" | "sent" | "failed" | "address_limit" | null;
  at: Date | null;
  lastLinkAt: Date | null;
}

/**
 * The notice of `row` at `now`, or none when no handover waits. The most recent link decides
 * `expired`, whatever the result kept of its email: the way out is the same, a new link.
 * Otherwise as pendingNotice: a `sending` older than SENDING_STALE_MS, or without a time, and
 * an address without a result, are failures. A handover stopped by the limit of the address
 * made no link, so it does not expire: it says so until the resend (OT1.6).
 */
export function transferNotice(row: TransferRow, now: Date): TransferNotice | undefined {
  if (row.email === null) return undefined;
  const { email, status, at, lastLinkAt } = row;
  if (status === "address_limit") return { email, send: "addressLimit" };
  if (lastLinkAt !== null && now.getTime() >= linkExpiresAt("transfer", lastLinkAt).getTime()) {
    return { email, send: "expired" };
  }
  if (status === "sent" || status === "failed") return { email, send: status };
  const fresh = status === "sending" && at !== null && now.getTime() - at.getTime() <= SENDING_STALE_MS;
  return { email, send: fresh ? "sending" : "failed" };
}

const SENDS: ReadonlySet<unknown> = new Set<TransferSend>(["sending", "sent", "failed", "addressLimit", "expired"]);

/** A notice as the server answers it, its two fields copied by name; anything else is none. */
export function transferNoticeOf(value: unknown): TransferNotice | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { email, send } = value as { email?: unknown; send?: unknown };
  if (typeof email !== "string" || !SENDS.has(send)) return undefined;
  return { email, send: send as TransferSend };
}

/**
 * Whether `typed` is the address of the account that holds the event (OT1.4): both are read
 * as email-address.ts reads an address (case, spaces, punycode), so that « Camille@Exemple.FR »
 * is the account's. What is not an address is not.
 */
export function isAccountAddress(typed: unknown, accountEmail: string): boolean {
  const own = emailAddress(accountEmail);
  const read = emailAddress(typed);
  return "value" in own && "value" in read && own.value === read.value;
}
