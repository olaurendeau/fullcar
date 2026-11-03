import type { Sent } from "@/app/e/[id]/run-action";
import type { MyEventsAnswer } from "./my-events";

/** The session's address and its events, as `myEvents` answers them. */
export type MyEventsShown = Extract<MyEventsAnswer, { state: "events" }>;

/** What a read of « Mes événements » comes to: the list, the way to /connexion (OA6.8), or a failure (OA6.7). */
export type MyEventsRead = { state: "events"; list: MyEventsShown } | { state: "signIn" } | { state: "failed" };

/**
 * The events whose sign-ups are not erased yet, which stay open to participants once the
 * account is deleted (`DeleteAccount.open`, OA9.3): the upcoming and the past, not the erased.
 */
export function openEventCount(list: Pick<MyEventsShown, "upcoming" | "past">): number {
  return list.upcoming.length + list.past.filter((event) => event.state === "past").length;
}

/** How many past events show before « Afficher les autres » (OA6.6). */
export const PAST_SHOWN = 10;

/**
 * The read of the page, from what `myEvents` answered, or `undefined` when the browser keeps
 * no session token, and nothing was sent. A failure, or an answer of another shape, says
 * nothing of the session: the page offers « Réessayer », never /connexion.
 */
export function myEventsRead(sent: Sent<unknown> | undefined): MyEventsRead {
  if (sent === undefined) return { state: "signIn" };
  if (!sent.ok || typeof sent.value !== "object" || sent.value === null) return { state: "failed" };
  const answer = sent.value as Partial<MyEventsShown> | { state: "signIn" };
  if (answer.state === "signIn") return { state: "signIn" };
  if (answer.state === "events" && typeof answer.email === "string" && Array.isArray(answer.upcoming) && Array.isArray(answer.past)) {
    return { state: "events", list: answer as MyEventsShown };
  }
  return { state: "failed" };
}

/** The past events shown: the first PAST_SHOWN until « Afficher les autres » is tapped, and how many more there are. */
export function shownPast<T>(past: readonly T[], expanded: boolean): { shown: T[]; more: number } {
  const shown = expanded ? past.slice() : past.slice(0, PAST_SHOWN);
  return { shown, more: past.length - shown.length };
}
