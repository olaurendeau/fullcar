import { useEffect, useState } from "react";
import type { OrganiserLeg, OrganiserPanelAnswer } from "@/domain/organiser-panel";
import { loadOrganiserPanel } from "./actions";

/*
 * The only client code that touches the organiser's token (docs/agents/architecture.md,
 * "Jetons"). The token travels in the URL's fragment, which the browser never sends, and
 * in the body of `loadOrganiserPanel`: never in a path, a query string, a header, a log,
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
  | { state: "failed" };

/**
 * What the server's answer means: the panel with its legs (C4.9 amended), or "not valid"
 * (C6.5). Anything else, such as the `undefined` Next resolves an action with on an
 * `x-action-redirect` response, is a failed check: a good link never reads "not valid".
 */
export function checkFromAnswer(answer: unknown, origin: string, id: string, token: string): AdminLinkCheck {
  if (typeof answer !== "object" || answer === null) return { state: "failed" };
  const { state, legs } = answer as { state?: unknown; legs?: unknown };
  if (state === "panel" && Array.isArray(legs) && token) {
    return { state: "valid", ...organiserLinks(origin, id, token), legs: legs as OrganiserLeg[] };
  }
  if (state === "invalid") return { state: "invalid" };
  return { state: "failed" };
}

/**
 * Whether the page's fragment holds the organiser's token of event `id`, as the server
 * answers (C4.9). Checked again when only the fragment changes, which does not reload the
 * page: pasting the right link over a wrong one. A failed check is not an invalid link.
 */
export function useAdminLinkCheck(id: string): AdminLinkCheck {
  const [check, setCheck] = useState<AdminLinkCheck>({ state: "checking" });

  useEffect(() => {
    let latest = 0;
    function verify() {
      const run = ++latest;
      const token = tokenInFragment(window.location.hash);
      const read: Promise<OrganiserPanelAnswer> = token
        ? loadOrganiserPanel(id, token)
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
    window.addEventListener("hashchange", verify);
    return () => {
      latest = -1;
      window.removeEventListener("hashchange", verify);
    };
  }, [id]);

  return check;
}
