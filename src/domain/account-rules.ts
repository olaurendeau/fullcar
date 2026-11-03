/**
 * How long the pieces of an organiser's account live (epic #581, decisions 8, 12
 * and 19 of docs/design/organizer-account), and what using a link from an email
 * gives. Instants, not wall clocks: these are moments on the server, not the hour
 * of an event.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A sign-in link: the session is wanted now (OA5.5). */
export const LOGIN_LINK_LIFETIME_MS = HOUR;
/** A confirmation link: opened once the organiser has shared the event (OA5.6). */
export const CONFIRMATION_LINK_LIFETIME_MS = 7 * DAY;
/** A transfer link: the event changes hands once the recipient opens it (OT2.6). */
export const TRANSFER_LINK_LIFETIME_MS = 7 * DAY;
/** A session, after the last visit, not after the sign-in: every page load slides it (OA9.6). */
export const SESSION_LIFETIME_MS = 90 * DAY;
/** An account without a visit for 3 calendar years is deleted (OA9.7). */
export const ACCOUNT_INACTIVITY_YEARS = 3;
/** The inactivity warning goes out 30 days before the deletion, once (OA9.7). */
export const INACTIVITY_WARNING_DAYS = 30;

export type LinkKind = "login" | "confirmation" | "transfer";

const LINK_LIFETIME_MS: Record<LinkKind, number> = {
  login: LOGIN_LINK_LIFETIME_MS,
  confirmation: CONFIRMATION_LINK_LIFETIME_MS,
  transfer: TRANSFER_LINK_LIFETIME_MS,
};

/** What the database keeps of a link, its token aside. */
export interface StoredLink {
  kind: LinkKind;
  createdAt: Date;
  usedAt: Date | null;
}

/** What the link page says (OA5.4 to OA5.7). */
export type LinkOutcome = "valid" | "expired" | "used" | "invalid";

/** The first instant the link no longer works. */
export function linkExpiresAt(kind: LinkKind, createdAt: Date): Date {
  return new Date(createdAt.getTime() + LINK_LIFETIME_MS[kind]);
}

/**
 * The outcome of using `link` on the page for links of kind `expected`. `null` is a
 * link that is not found: unknown token, truncated, or replaced by a correction of the
 * address (OA2.5). A link of the other kind is invalid, not expired: a sign-in link
 * confirms nothing, nor does a transfer link. A used link says so whatever its age, since that is what helps.
 */
export function linkOutcome(link: StoredLink | null, expected: LinkKind, now: Date): LinkOutcome {
  if (link === null || link.kind !== expected) return "invalid";
  if (link.usedAt !== null) return "used";
  if (now.getTime() >= linkExpiresAt(link.kind, link.createdAt).getTime()) return "expired";
  return "valid";
}

/**
 * How long a link stays in the database after its expiry, used or not (#589): the link
 * page still says « Ce lien a expiré » or « Ce lien a déjà servi » to an email opened
 * late, instead of « Ce lien n'est pas valide ». The row keeps no address.
 */
export const LINK_KEPT_AFTER_EXPIRY_MS = 30 * DAY;

/**
 * The first instant the daily task may delete the link: 30 days after its expiry. Not for
 * the confirmation link of a pending event, which stays as long as its event (OA5.6), nor for a
 * transfer link while the handover of its event waits (the notice reads the latest one to say
 * « expiré »): `deleteExpiredRows` keeps it as long as `event.transfer_email` is set, and the
 * handover goes, with its links, on day 30 of the event or with the deletion of the account.
 * Once nothing waits on it, this instant applies.
 */
export function linkDeletedAt(kind: LinkKind, createdAt: Date): Date {
  return new Date(linkExpiresAt(kind, createdAt).getTime() + LINK_KEPT_AFTER_EXPIRY_MS);
}

/** The first instant the session no longer works, unless a visit comes before. */
export function sessionExpiresAt(lastVisitAt: Date): Date {
  return new Date(lastVisitAt.getTime() + SESSION_LIFETIME_MS);
}

export function sessionIsAlive(lastVisitAt: Date, now: Date): boolean {
  return now.getTime() < sessionExpiresAt(lastVisitAt).getTime();
}

/** When an account without another visit is deleted: 3 calendar years later, in UTC. A 29 February gives the 1 March. */
export function accountDeletionDueAt(lastVisitAt: Date): Date {
  const due = new Date(lastVisitAt.getTime());
  due.setUTCFullYear(due.getUTCFullYear() + ACCOUNT_INACTIVITY_YEARS);
  return due;
}

/** When the inactivity warning is due: 30 days before the deletion. */
export function inactivityWarningDueAt(lastVisitAt: Date): Date {
  return new Date(accountDeletionDueAt(lastVisitAt).getTime() - INACTIVITY_WARNING_DAYS * DAY);
}

/** Whether the account has gone 3 years without a visit. Measured at the last visit, never at the sign-in. */
export function accountIsInactive(lastVisitAt: Date, now: Date): boolean {
  return now.getTime() >= accountDeletionDueAt(lastVisitAt).getTime();
}
