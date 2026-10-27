/**
 * Who may enter the organiser area of an event (epic #581, OA7.1–OA7.9, OA8.4): the only
 * place of this rule. The organiser is the session of the event's account, or the browser
 * that created the event and keeps its admin token (OA7.6). Everything else is said, never
 * opened: an event still pending, one without an organiser, one anonymised, a session of
 * another account, or nobody.
 *
 * An access is an object only `decideOrganiserAccess` makes, kept in a set of this module:
 * `withOrganiserPhones` asks `grantsAccessTo` whether it is one, so that neither a boolean
 * « checked » nor an object of the same shape made elsewhere opens anything. The token is
 * compared in constant time (`adminTokenMatches`), never logged nor kept.
 */
import { adminTokenMatches } from "./admin-token";

declare const granted: unique symbol;

/** The organiser's right on one event, for one request: given by `decideOrganiserAccess` alone. */
export interface OrganiserAccess {
  readonly eventId: string;
  /** How it was granted: the session of the event's account, or the creation browser's token. */
  readonly via: "session" | "adminToken";
  readonly [granted]: true;
}

/** What the rule reads of the event, as the database keeps it. */
export interface OrganiserAccessEvent {
  id: string;
  /** The confirmed organiser's account; null while pending, or once the account is deleted. */
  accountId: string | null;
  /** Whether a confirmation link has served (`confirmed_at`). */
  confirmed: boolean;
  anonymised: boolean;
  /** The admin token's SHA-256 in hex; null once revoked, which no token matches. */
  adminTokenHash: string | null;
}

/** Who asks: the admin token their body carries, and the account of their session, if it is alive. */
export interface OrganiserVisitor {
  adminToken: unknown;
  account: { id: string; email: string } | undefined;
}

/**
 * - `organiser`: the panel, with the access that `withOrganiserPhones` takes (OA7.3);
 * - `ended`: the organiser's session on an anonymised event: no panel, nothing to do (OA8.4);
 * - `pending`: not confirmed yet, outside the creation browser, any session (OA7.7);
 * - `orphan`: its account deleted, for every visitor (OA7.9);
 * - `notYours`: the session of another account, with that session's own address (OA7.2);
 * - `signIn`: neither session nor token (OA7.1).
 */
export type OrganiserDecision =
  | { state: "organiser"; access: OrganiserAccess }
  | { state: "ended" | "pending" | "orphan" | "signIn" }
  | { state: "notYours"; email: string };

const issued = new WeakSet<object>();

function grant(eventId: string, via: OrganiserAccess["via"]): { state: "organiser"; access: OrganiserAccess } {
  const access = Object.freeze({ eventId, via }) as OrganiserAccess;
  issued.add(access);
  return { state: "organiser", access };
}

/**
 * The decision, in this order: an event without an organiser says so to everybody, the token
 * left behind included (OA7.9); an anonymised one opens nothing, its organiser's session
 * reads that it ended (OA8.4); then the session of the event's account, then the creation
 * browser's token (OA7.4); then a pending event says so to everybody else (OA7.7); then the
 * session of another account (OA7.2), and nobody (OA7.1). The token is compared whatever
 * the order decides, so that the time taken does not depend on the event's state.
 */
export function decideOrganiserAccess(event: OrganiserAccessEvent, { adminToken, account }: OrganiserVisitor): OrganiserDecision {
  const holdsToken = adminTokenMatches(adminToken, event.adminTokenHash);
  const ownSession = account !== undefined && event.accountId !== null && account.id === event.accountId;
  if (event.confirmed && event.accountId === null) return { state: "orphan" };
  if (event.anonymised) {
    if (ownSession) return { state: "ended" };
    return account ? { state: "notYours", email: account.email } : { state: "signIn" };
  }
  if (ownSession) return grant(event.id, "session");
  if (holdsToken) return grant(event.id, "adminToken");
  if (!event.confirmed) return { state: "pending" };
  return account ? { state: "notYours", email: account.email } : { state: "signIn" };
}

/** Whether `access` is one the rule gave, for the event `eventId`. Anything else, a copy included, is not. */
export function grantsAccessTo(access: OrganiserAccess, eventId: string): boolean {
  const candidate: unknown = access;
  return typeof candidate === "object" && candidate !== null && issued.has(candidate) && access.eventId === eventId;
}

/**
 * What the organiser's request carries in its body: `{ adminToken, session }`, each as it
 * came, for the comparison to refuse. Only own fields are read; anything but a plain object
 * carries neither.
 */
export function organiserProofOf(body: unknown): { adminToken: unknown; session: unknown } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { adminToken: undefined, session: undefined };
  const own = (key: string): unknown => (Object.hasOwn(body, key) ? (body as Record<string, unknown>)[key] : undefined);
  return { adminToken: own("adminToken"), session: own("session") };
}
