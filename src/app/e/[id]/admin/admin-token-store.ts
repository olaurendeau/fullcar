import { useCallback, useEffect, useRef, useState } from "react";
import { readSessionToken } from "@/app/session-token";
import type { LegCounts } from "@/db/legs";
import type { EventFields, EventHeader } from "@/domain/event";
import type { EndedHeader, OrganiserLeg, OrganiserPanelAnswer, OrganiserPerson } from "@/domain/organiser-panel";
import { pendingNoticeOf, type PendingNotice } from "@/domain/pending-send";
import { isWallClock, isWallDate, type WallDate } from "@/domain/wall-clock";
import type { EditEventOutcome } from "../edit-event";
import type { ResendOutcome } from "../pending-email";
import { sendAction, type Sent } from "../run-action";
import type { RemovePersonOutcome } from "../remove-person";
import { loadOrganiserPanel, removePersonAsOrganiser, resendEmail, updateEvent } from "./actions";

/*
 * The only browser code that touches the organiser's admin token (docs/agents/architecture.md,
 * « Session, liens et jeton d'admin », #597), as session-token.ts is for the session's. The
 * browser that created the event keeps the token the server drew, in `localStorage` under its
 * event's key, `fullcar:admin-token:{id}`; without `localStorage`, the page's memory keeps it.
 * It travels in the body of `loadOrganiserPanel`, `updateEvent`, `removePersonAsOrganiser`,
 * `signOut` and `resendEmail` only, with the session's: never in a URL, a header, a cookie, a log,
 * an error or the page. There is no organiser's
 * link any more: a fragment on `/e/{id}/admin` is ignored (OA7.5). It is compared on the
 * server only.
 */

/** What is used of `localStorage`. */
export type AdminTokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** The event's own key: the token of one event is worth nothing on another. */
const PREFIX = "fullcar:admin-token:";
const keyOf = (id: string) => `${PREFIX}${id}`;

/**
 * The shape server-token.ts draws: 22 base64url characters for exactly 16 bytes, whose last
 * character can only be A, Q, g or w. Anything else kept under the key is no token.
 */
const FORMAT = /^[A-Za-z0-9_-]{21}[AQgw]$/;

/**
 * The admin token's functions over a storage. `storage` is a getter: some browsers throw on
 * the `localStorage` property itself.
 */
export function adminTokens({ storage }: { storage: () => AdminTokenStorage }) {
  /** The page's memory, for a browser whose `localStorage` refuses the token. */
  const memory = new Map<string, string>();

  /** Keeps the token of event `id`, which this browser has just created. Never throws. */
  function keepAdminToken(id: string, token: string): void {
    try {
      storage().setItem(keyOf(id), token);
    } catch {
      memory.set(id, token);
    }
  }

  /** The token this browser keeps for event `id`, if it does. Reads only; a malformed value is none. */
  function readAdminToken(id: string): string | undefined {
    const kept = memory.get(id);
    if (kept !== undefined) return kept;
    try {
      const token = storage().getItem(keyOf(id));
      return typeof token === "string" && FORMAT.test(token) ? token : undefined;
    } catch {
      return undefined;
    }
  }

  /** The admin-token keys of the storage, with the value each holds. Never throws: none when unavailable. */
  function storedEntries(): [string, string | null][] {
    try {
      const kept = storage();
      const keys = Array.from({ length: kept.length }, (_, n) => kept.key(n)).filter((key) => key?.startsWith(PREFIX));
      return keys.map((key) => [key!, kept.getItem(key!)]);
    } catch {
      return [];
    }
  }

  /**
   * Every well-formed admin token this browser keeps, whatever its event, for « Se déconnecter »
   * (OA9.1). Reads only.
   */
  function keptAdminTokens(): string[] {
    const stored = storedEntries().map(([, token]) => token);
    const all = [...memory.values(), ...stored].filter((token): token is string => typeof token === "string" && FORMAT.test(token));
    return [...new Set(all)];
  }

  /**
   * Forgets `tokens`, once « Se déconnecter » has revoked them (OA9.1): each key that still holds
   * one of them, and the page's memory. A token another tab stored meanwhile stays. Never throws.
   */
  function forgetAdminTokens(tokens: readonly string[]): void {
    const sent = new Set(tokens);
    for (const [id, token] of memory) if (sent.has(token)) memory.delete(id);
    for (const [key, token] of storedEntries()) {
      if (token === null || !sent.has(token)) continue;
      try {
        storage().removeItem(key);
      } catch {
        // Unavailable: there is nothing more to forget.
      }
    }
  }

  return { keepAdminToken, readAdminToken, keptAdminTokens, forgetAdminTokens };
}

export const { keepAdminToken, readAdminToken, keptAdminTokens, forgetAdminTokens } = adminTokens({
  storage: () => window.localStorage,
});

/**
 * What the organiser's requests carry in their body (#596): the token this browser keeps for
 * event `id`, and the session's, each only when the browser keeps one. Nothing else: the URL is
 * never read.
 */
export function organiserProof(id: string): { adminToken?: string; session?: string } {
  const adminToken = readAdminToken(id);
  const session = readSessionToken();
  return { ...(adminToken && { adminToken }), ...(session && { session }) };
}

/**
 * Goes to the organiser area of a new event, its token kept already (OA1.6), with the App
 * Router (`useRouter()`): no fragment, nothing after the path.
 */
export function goToOrganiserArea(router: { push(href: string): void }, id: string) {
  router.push(`/e/${id}/admin`);
}

/**
 * Why the organiser area does not open, each with its own screen (#598): an unknown event,
 * nobody (OA7.1), pending outside the creation browser (OA7.7), without an organiser
 * (OA7.9), another account's session with its address (OA7.2), or the organiser of an
 * anonymised event, with what is left of it and its day 30 (OA8.4).
 */
export type Refusal =
  | { kind: "invalid" | "signIn" | "pending" | "orphan" }
  | { kind: "notYours"; email: string }
  | { kind: "ended"; event: EndedHeader; erasedOn: WallDate };

export type OrganiserCheck =
  | { state: "checking" }
  | { state: "valid"; publicUrl: string; legs: OrganiserLeg[]; persons: OrganiserPerson[]; pending?: PendingNotice }
  | { state: "refused"; refusal: Refusal }
  | { state: "failed"; retrying?: boolean };

/** The states of the access rule (#596) that carry nothing. */
const BARE = new Set(["invalid", "signIn", "pending", "orphan"]);

/** What is left of an anonymised event, copied field by field, or nothing when it is not that. */
function endedHeader(value: unknown): EndedHeader | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { title, location, allerAt, retourAt } = value as Record<string, unknown>;
  if (typeof title !== "string" || typeof location !== "string" || !isWallClock(allerAt)) return undefined;
  if (retourAt !== null && !isWallClock(retourAt)) return undefined;
  return { title, location, allerAt, retourAt };
}

/** The refusal a state of the access rule (#596) says, or nothing for anything else. */
function refusalOf(answer: Record<string, unknown>): Refusal | undefined {
  const { state, email, event, erasedOn } = answer;
  if (typeof state === "string" && BARE.has(state)) return { kind: state as "invalid" | "signIn" | "pending" | "orphan" };
  if (state === "notYours" && typeof email === "string") return { kind: "notYours", email };
  const header = state === "ended" ? endedHeader(event) : undefined;
  if (header && typeof erasedOn === "string" && isWallDate(erasedOn)) return { kind: "ended", event: header, erasedOn };
  return undefined;
}

/**
 * What the server's answer means: the panel with its legs and the link to share (C4.9 amended,
 * OA7.3), with the notice of a pending event (OA1.7), or refused with the screen of the state the access rule decides (#596, #598).
 * Anything else, such as the `undefined` Next resolves an action with on an
 * `x-action-redirect` response, is a failed check: the organiser is never refused for it.
 */
export function checkFromAnswer(answer: unknown, origin: string, id: string): OrganiserCheck {
  if (typeof answer !== "object" || answer === null) return { state: "failed" };
  const { state, legs, persons } = answer as { state?: unknown; legs?: unknown; persons?: unknown };
  if (state === "panel" && Array.isArray(legs)) {
    const all = Array.isArray(persons) ? (persons as OrganiserPerson[]) : [];
    const pending = pendingNoticeOf((answer as { pending?: unknown }).pending);
    return { state: "valid", publicUrl: `${origin}/e/${id}`, legs: legs as OrganiserLeg[], persons: all, ...(pending && { pending }) };
  }
  const refusal = refusalOf(answer as Record<string, unknown>);
  return refusal ? { state: "refused", refusal } : { state: "failed" };
}

/**
 * What « Réessayer » shows while it reads again (O5.3): the failed check, retrying, so that
 * the alert and its button stay. Nothing to start otherwise: a retry already running (O5.8),
 * or a check that has not failed.
 */
export function retryFrom(check: OrganiserCheck): OrganiserCheck | undefined {
  return check.state === "failed" && !check.retrying ? { state: "failed", retrying: true } : undefined;
}

/**
 * Whether this browser may enter the organiser area of event `id`, as the server answers to
 * `organiserProof` (C4.9, #596). `retry()` checks again after a failure, without reloading the
 * page (O5.3). `read()` reads the panel again, and applies nothing (#182). `edit()` sends the
 * organiser's change of the event (epic #250) with the same proof, `before`, the values the
 * form loaded, and `removal`, the numbers a confirmation of the retour's removal showed (#270).
 * Without one, the argument is omitted, never `null`. `resend()` sends the pending event's
 * confirmation email again (OA2.4), with the same proof. `remove()` sends « Retirer » of
 * « Personnes inscrites » (#672) with the same proof, and the page's personal token, which only
 * chooses the board answered; the board sends it, as its own actions (`sendAction`).
 */
export function useOrganiserCheck(id: string): {
  check: OrganiserCheck;
  retry: () => void;
  read: () => Promise<Sent<OrganiserPanelAnswer>>;
  edit: (fields: EventFields, before: EventHeader, removal?: LegCounts) => Promise<Sent<EditEventOutcome>>;
  resend: () => Promise<Sent<ResendOutcome>>;
  remove: (personId: string, deviceToken: string | undefined) => Promise<RemovePersonOutcome>;
} {
  const [check, setCheck] = useState<OrganiserCheck>({ state: "checking" });
  const verifyAgain = useRef(() => {});

  useEffect(() => {
    let latest = 0;
    function verify() {
      const run = ++latest;
      loadOrganiserPanel(id, organiserProof(id)).then(
        (answer) => {
          if (run === latest) setCheck(checkFromAnswer(answer, window.location.origin, id));
        },
        () => {
          if (run === latest) setCheck({ state: "failed" });
        },
      );
    }
    verify();
    verifyAgain.current = verify;
    return () => {
      latest = -1;
      verifyAgain.current = () => {};
    };
  }, [id]);

  const retry = useCallback(() => {
    const retrying = retryFrom(check);
    if (!retrying) return;
    setCheck(retrying);
    verifyAgain.current();
  }, [check]);

  const read = useCallback(() => sendAction<OrganiserPanelAnswer>(() => loadOrganiserPanel(id, organiserProof(id))), [id]);

  const edit = useCallback(
    (fields: EventFields, before: EventHeader, removal?: LegCounts) => {
      const proof = organiserProof(id);
      return sendAction<EditEventOutcome>(() =>
        removal ? updateEvent(id, proof, fields, before, removal) : updateEvent(id, proof, fields, before),
      );
    },
    [id],
  );

  const resend = useCallback(() => sendAction<ResendOutcome>(() => resendEmail(id, organiserProof(id))), [id]);

  const remove = useCallback(
    (personId: string, deviceToken: string | undefined) => removePersonAsOrganiser(id, organiserProof(id), deviceToken, personId),
    [id],
  );

  return { check, retry, read, edit, resend, remove };
}
