import { useCallback, useEffect, useRef, useState } from "react";
import { readSessionToken } from "@/app/session-token";
import type { LegCounts } from "@/db/legs";
import type { EventFields, EventHeader } from "@/domain/event";
import type { OrganiserLeg, OrganiserPanelAnswer } from "@/domain/organiser-panel";
import type { EditEventOutcome } from "../edit-event";
import { sendAction, type Sent } from "../run-action";
import { loadOrganiserPanel, updateEvent } from "./actions";

/*
 * The only browser code that touches the organiser's admin token (docs/agents/architecture.md,
 * « Session, liens et jeton d'admin », #597), as session-token.ts is for the session's. The
 * browser that created the event keeps the token the server drew, in `localStorage` under its
 * event's key, `fullcar:admin-token:{id}`; without `localStorage`, the page's memory keeps it.
 * It travels in the body of `loadOrganiserPanel` and `updateEvent` only, with the session's:
 * never in a URL, a header, a cookie, a log, an error or the page. There is no organiser's
 * link any more: a fragment on `/e/{id}/admin` is ignored (OA7.5). It is compared on the
 * server only.
 */

/** What is used of `localStorage`. */
export type AdminTokenStorage = Pick<Storage, "getItem" | "setItem">;

/** The event's own key: the token of one event is worth nothing on another. */
const keyOf = (id: string) => `fullcar:admin-token:${id}`;

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

  return { keepAdminToken, readAdminToken };
}

export const { keepAdminToken, readAdminToken } = adminTokens({ storage: () => window.localStorage });

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

export type OrganiserCheck =
  | { state: "checking" }
  | { state: "valid"; publicUrl: string; legs: OrganiserLeg[] }
  | { state: "refused" }
  | { state: "failed"; retrying?: boolean };

/** The states of the access rule (#596), each refused alike until its own screen comes (#598). */
const REFUSED = new Set(["invalid", "signIn", "notYours", "pending", "orphan", "ended"]);

/**
 * What the server's answer means: the panel with its legs and the link to share (C4.9 amended,
 * OA7.3), or refused for every state the access rule refuses with (#596). Anything else, such
 * as the `undefined` Next resolves an action with on an `x-action-redirect` response, is a
 * failed check: the organiser is never refused for it.
 */
export function checkFromAnswer(answer: unknown, origin: string, id: string): OrganiserCheck {
  if (typeof answer !== "object" || answer === null) return { state: "failed" };
  const { state, legs } = answer as { state?: unknown; legs?: unknown };
  if (state === "panel" && Array.isArray(legs)) return { state: "valid", publicUrl: `${origin}/e/${id}`, legs: legs as OrganiserLeg[] };
  if (typeof state === "string" && REFUSED.has(state)) return { state: "refused" };
  return { state: "failed" };
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
 * Without one, the argument is omitted, never `null`.
 */
export function useOrganiserCheck(id: string): {
  check: OrganiserCheck;
  retry: () => void;
  read: () => Promise<Sent<OrganiserPanelAnswer>>;
  edit: (fields: EventFields, before: EventHeader, removal?: LegCounts) => Promise<Sent<EditEventOutcome>>;
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

  return { check, retry, read, edit };
}
