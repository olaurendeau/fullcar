import type { BarMessage } from "@/components/event/message-bar";
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

/** What an action changes on the page: the bar's message, and the board. */
export interface ActionPage {
  message: (message: BarMessage | null) => void;
  state: (state: EventState) => void;
}

/**
 * The page's `runAction` (#87). The control `key` is `sending` until the answer, and a second
 * run of it meanwhile sends nothing. Offline or a server error goes to the bar; an answer
 * closes it, and its state replaces the page's. The message, a success included, is replaced
 * when the action ends, never cleared before: « Fermer » stays where it is. What the page says
 * of a success is its own (#91).
 */
export function actionRunner(page: ActionPage, online?: () => boolean) {
  const inFlight = new Set<string>();

  return async function runAction<T>(
    key: string,
    action: () => Promise<T>,
    sending?: (sending: boolean) => void,
  ): Promise<Sent<T> | undefined> {
    if (inFlight.has(key)) return undefined;
    inFlight.add(key);
    sending?.(true);
    try {
      const sent = await sendAction(action, online);
      if (!sent.ok) page.message({ kind: "problem", problem: sent.problem });
      else {
        page.message(null);
        const state = stateOf(sent.value);
        if (state) page.state(state);
      }
      return sent;
    } finally {
      inFlight.delete(key);
      sending?.(false);
    }
  };
}

/** The state an action's answer carries back, refusal included (C5.7, C11.6), if any. */
export function stateOf(answer: unknown): EventState | undefined {
  if (typeof answer !== "object" || answer === null || !("state" in answer)) return undefined;
  return Array.isArray(answer.state) ? (answer.state as EventState) : undefined;
}
