import { useCallback, useEffect, useRef, useState } from "react";
import type { LegCounts } from "@/db/legs";
import type { EventFields, EventHeader } from "@/domain/event";
import type { OrganiserLeg, OrganiserPanelAnswer } from "@/domain/organiser-panel";
import type { EditEventOutcome } from "../edit-event";
import { sendAction, type Sent } from "../run-action";
import { loadOrganiserPanel, updateEvent } from "./actions";

/*
 * The only client code that touches the organiser's token (docs/agents/architecture.md,
 * "Jetons"). The token travels in the URL's fragment, which the browser never sends, and
 * in the body of `loadOrganiserPanel` and `updateEvent`: never in a path, a query string, a header, a log,
 * an error report or the browser's storage. It is compared on the server only.
 */

/**
 * Goes to the organiser's link of a new event, the token in the fragment (#3, C1.5), with
 * the App Router (`useRouter()`): the fragment is never part of a request.
 */
export function goToAdminLink(router: { push(href: string): void }, { id, token }: { id: string; token: string }) {
  router.push(`/e/${id}/admin#${token}`);
}

/** The token in a URL's fragment (`location.hash`), if there is one. */
export function tokenInFragment(hash: string): string | undefined {
  return hash.slice(1) || undefined;
}

/** The two links the organiser keeps: the one to share, and their own (C4.1). */
export function organiserLinks(origin: string, id: string, token: string) {
  return { publicUrl: `${origin}/e/${id}`, adminUrl: `${origin}/e/${id}/admin#${token}` };
}

export type AdminLinkCheck =
  | { state: "checking" }
  | { state: "valid"; publicUrl: string; adminUrl: string; legs: OrganiserLeg[] }
  | { state: "invalid" }
  | { state: "failed"; retrying?: boolean };

/** The states of the access rule (#596), each read « non valide » until its own screen comes (#598). */
const REFUSED = new Set(["invalid", "signIn", "notYours", "pending", "orphan", "ended"]);

/**
 * What the server's answer means: the panel with its legs (C4.9 amended), or "not valid"
 * (C6.5) for every state the access rule refuses with (#596). Anything else, such as the `undefined` Next resolves an action with on an
 * `x-action-redirect` response, is a failed check: a good link never reads "not valid".
 */
export function checkFromAnswer(answer: unknown, origin: string, id: string, token: string): AdminLinkCheck {
  if (typeof answer !== "object" || answer === null) return { state: "failed" };
  const { state, legs } = answer as { state?: unknown; legs?: unknown };
  if (state === "panel" && Array.isArray(legs) && token) {
    return { state: "valid", ...organiserLinks(origin, id, token), legs: legs as OrganiserLeg[] };
  }
  if (typeof state === "string" && REFUSED.has(state)) return { state: "invalid" };
  return { state: "failed" };
}

/**
 * What « Réessayer » shows while it reads again (O5.3): the failed check, retrying, so that
 * the alert and its button stay. Nothing to start otherwise: a retry already running (O5.8),
 * or a check that has not failed.
 */
export function retryFrom(check: AdminLinkCheck): AdminLinkCheck | undefined {
  return check.state === "failed" && !check.retrying ? { state: "failed", retrying: true } : undefined;
}

/**
 * Whether the page's fragment holds the organiser's token of event `id`, as the server
 * answers (C4.9). Checked again when only the fragment changes, which does not reload the
 * page: pasting the right link over a wrong one. A failed check is not an invalid link.
 * `retry()` checks again after a failure, with the token read again from the fragment,
 * without reloading the page (O5.3). `read()` reads the panel again with the token of the
 * fragment, and applies nothing (#182). `edit()` sends the organiser's change of the event
 * (epic #250) with the token of the fragment, `before`, the values the form loaded, and `removal`,
 * the numbers a confirmation of the retour's removal showed (#270). Without one, the argument is
 * omitted, never `null`.
 */
export function useAdminLinkCheck(id: string): {
  check: AdminLinkCheck;
  retry: () => void;
  read: () => Promise<Sent<OrganiserPanelAnswer>>;
  edit: (fields: EventFields, before: EventHeader, removal?: LegCounts) => Promise<Sent<EditEventOutcome>>;
} {
  const [check, setCheck] = useState<AdminLinkCheck>({ state: "checking" });
  const verifyAgain = useRef(() => {});

  useEffect(() => {
    let latest = 0;
    function verify() {
      const run = ++latest;
      const token = tokenInFragment(window.location.hash);
      const read: Promise<OrganiserPanelAnswer> = token
        ? loadOrganiserPanel(id, { adminToken: token })
        : Promise.resolve({ state: "invalid" });
      read.then(
        (answer) => {
          if (run === latest) setCheck(checkFromAnswer(answer, window.location.origin, id, token ?? ""));
        },
        () => {
          if (run === latest) setCheck({ state: "failed" });
        },
      );
    }
    verify();
    verifyAgain.current = verify;
    window.addEventListener("hashchange", verify);
    return () => {
      latest = -1;
      verifyAgain.current = () => {};
      window.removeEventListener("hashchange", verify);
    };
  }, [id]);

  const retry = useCallback(() => {
    const retrying = retryFrom(check);
    if (!retrying) return;
    setCheck(retrying);
    verifyAgain.current();
  }, [check]);

  const read = useCallback(() => {
    const token = tokenInFragment(window.location.hash);
    return sendAction<OrganiserPanelAnswer>(() =>
      token ? loadOrganiserPanel(id, { adminToken: token }) : Promise.resolve({ state: "invalid" }),
    );
  }, [id]);

  const edit = useCallback(
    (fields: EventFields, before: EventHeader, removal?: LegCounts) => {
      const token = tokenInFragment(window.location.hash);
      return sendAction<EditEventOutcome>(() => {
        if (!token) return Promise.resolve<EditEventOutcome>({ ok: false, error: "invalid" });
        const proof = { adminToken: token };
        return removal ? updateEvent(id, proof, fields, before, removal) : updateEvent(id, proof, fields, before);
      });
    },
    [id],
  );

  return { check, retry, read, edit };
}
