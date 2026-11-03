import type { Sent } from "@/app/e/[id]/run-action";
import { linkTokenOf } from "./link-fragment";

/*
 * What the browser does with a link's page on the press of its button (OA5.1 to OA5.8): the token
 * is read from the fragment, sent in the body of the action, and the answer says where to go or
 * which page to show. The functions take what they send with and keep with, so a test gives its
 * own. Nothing here logs, and nothing puts the token anywhere but the body of `send`.
 */

/** Why a page shows no button: the link opens nothing (OA5.4 to OA5.7). */
export type LinkScreen = "expired" | "used" | "invalid";

/** The alert above the button (OA5.8): no connection, or an error of the server. */
export type OpenAlert = "offline" | "failed";

/** What « Se connecter » or « Confirmer et se connecter » leads to. `to` is a path, never a token. */
export type OpenOutcome = { kind: "opened"; to: string } | { kind: "screen"; screen: LinkScreen } | { kind: "alert"; alert: OpenAlert };

const SCREENS: readonly unknown[] = ["expired", "used", "invalid"] satisfies LinkScreen[];

/** The answer's `state`, if it is an object that has one. */
function stateOf(sent: { value: unknown }): unknown {
  const answer = sent.value;
  return typeof answer === "object" && answer !== null ? (answer as { state?: unknown }).state : undefined;
}

/**
 * Uses the link of `hash` (OA5.2, OA5.3): `send` takes its token to the action. A fragment that
 * is no token is a link that is not valid, and nothing is sent. The session of an `opened`
 * answer is handed to `keep`, which says whether the browser kept it: if not, the page says it
 * failed rather than lead on without a session. The landing is the event's admin when the link
 * brings one (OA4.4, OA5.3), Mes événements otherwise.
 */
export async function openLinkInBrowser(
  hash: string,
  send: (token: string) => Promise<Sent<unknown>>,
  keep: (session: string) => boolean,
): Promise<OpenOutcome> {
  const token = linkTokenOf(hash);
  if (token === undefined) return { kind: "screen", screen: "invalid" };
  const sent = await send(token);
  if (!sent.ok) return { kind: "alert", alert: sent.problem };
  const state = stateOf(sent);
  if (SCREENS.includes(state)) return { kind: "screen", screen: state as LinkScreen };
  if (state === "opened") {
    const { session, eventId } = sent.value as { session?: unknown; eventId?: unknown };
    if (typeof session === "string" && (eventId === null || typeof eventId === "string") && keep(session)) {
      return { kind: "opened", to: eventId === null ? "/mes-evenements" : `/e/${encodeURIComponent(eventId)}/admin` };
    }
  }
  return { kind: "alert", alert: "failed" };
}

/** The alerts above « Recevoir un nouveau lien » (OA5.6): a limit, or the email that did not go. */
export type ResendAlert = OpenAlert | "tooMany";

/** What « Recevoir un nouveau lien » leads to: « Regardez vos e-mails », another page, or an alert. */
export type ResendOutcome = { kind: "sent" } | { kind: "screen"; screen: "used" | "invalid" } | { kind: "alert"; alert: ResendAlert };

/**
 * Asks for a new confirmation link, with nothing typed (OA5.6): `send` takes the expired link's
 * token to the action, which writes to the address the event waits on. The address is never shown.
 */
export async function resendLinkInBrowser(hash: string, send: (token: string) => Promise<Sent<unknown>>): Promise<ResendOutcome> {
  const token = linkTokenOf(hash);
  if (token === undefined) return { kind: "screen", screen: "invalid" };
  const sent = await send(token);
  if (!sent.ok) return { kind: "alert", alert: sent.problem };
  const state = stateOf(sent);
  if (state === "sent") return { kind: "sent" };
  if (state === "used" || state === "invalid") return { kind: "screen", screen: state };
  return { kind: "alert", alert: state === "tooMany" ? "tooMany" : "failed" };
}
