import type { EventState } from "./event-state";

/**
 * What goes wrong with an action, as the page says it (#87): `offline`, « Action impossible,
 * vérifiez la connexion », and `failed`, the generic message, with no technical detail.
 */
export type ActionProblem = "offline" | "failed";

export type Sent<T> = { ok: true; value: T } | { ok: false; problem: ActionProblem };

/**
 * Sends a server action. Offline, nothing is sent. A request that throws is `offline` when
 * the connection is gone by then, `failed` otherwise; what it threw is dropped, never shown.
 */
export async function sendAction<T>(
  action: () => Promise<T>,
  online: () => boolean = () => navigator.onLine,
): Promise<Sent<T>> {
  if (!online()) return { ok: false, problem: "offline" };
  try {
    return { ok: true, value: await action() };
  } catch {
    return { ok: false, problem: online() ? "failed" : "offline" };
  }
}

/**
 * What an action changes on the page: the board, and the bar's information, which goes once an
 * action that began after it ends (rule 4): `begins` is told as it leaves, what it returns once it ends.
 */
export interface ActionPage {
  state: (state: EventState) => void;
  begins: () => () => void;
}

/**
 * The page's `runAction` (#87). The control `key` is `sending` until the answer, and a second
 * run of it meanwhile sends nothing. An answer's state replaces the page's. What came of the
 * action, the page says, in the bar or in the sheet that sent it (#216): never this. `leaves`
 * is told once the run goes, offline too, and never when it is dropped (`Send.leaves`, #222).
 */
export function actionRunner(page: ActionPage, online?: () => boolean) {
  const inFlight = new Set<string>();

  return async function runAction<T>(
    key: string,
    action: () => Promise<T>,
    sending?: (sending: boolean) => void,
    leaves?: () => void,
  ): Promise<Sent<T> | undefined> {
    if (inFlight.has(key)) return undefined;
    inFlight.add(key);
    const ends = page.begins();
    leaves?.();
    sending?.(true);
    try {
      const sent = await sendAction(action, online);
      const state = sent.ok && stateOf(sent.value);
      if (state) page.state(state);
      return sent;
    } finally {
      inFlight.delete(key);
      sending?.(false);
      ends();
    }
  };
}

/**
 * Whether `value` is a state the page can apply: its header and its legs (epic #250). The
 * legs alone, as a server not yet deployed would answer, are not one: the page keeps its own.
 */
export function isEventState(value: unknown): value is EventState {
  if (typeof value !== "object" || value === null || !("event" in value) || !("legs" in value)) return false;
  return typeof value.event === "object" && value.event !== null && Array.isArray(value.legs);
}

/** The state a read answered: nothing for a failure, an unknown event, or the legs alone. */
export function stateRead(sent: Sent<unknown> | undefined): EventState | undefined {
  return sent?.ok && isEventState(sent.value) ? sent.value : undefined;
}

/**
 * What showing `next` after `before` does, whichever way it came (an action, a read, `apply`):
 * nothing when `next` is not a state, the legs alone included; otherwise whether the tabs go
 * or come with the retour.
 */
export function stateShown(before: EventState, next: unknown): { state: EventState; tabsChange: boolean } | undefined {
  if (!isEventState(next)) return undefined;
  return { state: next, tabsChange: !before.event.retourAt !== !next.event.retourAt };
}

/**
 * What the page shows of `next` while a sheet hides it, when `next` takes away the retour that
 * `shown` has (epic #250, § 5): `next`, with `shown`'s end and retour leg, so that a sheet on the
 * retour closes over it rather than going with it (rule 9). Nothing to hold otherwise.
 */
export function withRetourHeld(shown: EventState, next: EventState): EventState | undefined {
  if (!shown.event.retourAt || next.event.retourAt) return undefined;
  const legs = [...next.legs.filter(({ leg }) => leg !== "retour"), ...shown.legs.filter(({ leg }) => leg === "retour")];
  return { event: { ...next.event, retourAt: shown.event.retourAt }, legs };
}

/** The state an action's answer carries back, refusal included (C5.7, C11.6), if any. */
export function stateOf(answer: unknown): EventState | undefined {
  if (typeof answer !== "object" || answer === null || !("state" in answer)) return undefined;
  return isEventState(answer.state) ? answer.state : undefined;
}
