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
 * What an action changes on the page: the board, given with the answer it came in, and the bar's
 * information, which goes once an action that began after it ends (rule 4): `begins` is told as it
 * leaves, what it returns once it ends.
 */
export interface ActionPage {
  state: (state: EventState, answer: unknown) => void;
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
      if (state) page.state(state, sent.value);
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

/** Whether a read answered that the event is anonymised (OA8.3, #799): the page is then « Événement terminé ». */
export function readEnded(sent: Sent<unknown> | undefined): boolean {
  if (!sent?.ok || typeof sent.value !== "object" || sent.value === null) return false;
  return "ended" in sent.value && sent.value.ended === true;
}

/** The state a read answered: nothing for a failure, an unknown event, an ended one, or the legs alone. */
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
 * The device's persons `shown` had and `next` has on no leg (remove-person v2, « Focus, barre,
 * envoi »): removed, here or elsewhere. Their lines in the bar no longer have a subject.
 */
export function devicePersonsGone(shown: EventState, next: EventState): string[] {
  const ids = (state: EventState) => new Set(state.legs.flatMap((leg) => leg.device.map((person) => person.id)));
  const kept = ids(next);
  return [...ids(shown)].filter((id) => !kept.has(id));
}

/**
 * The cars `shown` had, on each leg `next` still has, whose driver `next` has nowhere: removed with
 * her, here or elsewhere, whoever's device she was on. What the bar says about them has no subject
 * any more, as when « Retirer la voiture » takes a car (#850's review).
 */
export function carsOfPersonsGone(shown: EventState, next: EventState): string[] {
  const legs = new Set(next.legs.map(({ leg }) => leg));
  const present = new Set(
    next.legs.flatMap((leg) => [
      ...leg.cars.flatMap((car) => [car.driver, ...car.passengers]),
      ...leg.withoutCar,
      ...leg.device,
    ]).map((person) => person.id),
  );
  return shown.legs
    .filter(({ leg }) => legs.has(leg))
    .flatMap((leg) => leg.cars)
    .filter((car) => !present.has(car.driver.id))
    .map((car) => car.id);
}

const refusedGone = (answer: unknown): answer is { error: "personGone" } =>
  typeof answer === "object" && answer !== null && "error" in answer && answer.error === "personGone";

/**
 * The persons an answer refused by `personGone` names (RP5.4), its `goneIds`: its failure says
 * they are no longer part of the event. Nobody else: another person gone with that answer, removed
 * elsewhere, is news (RP5.3).
 */
export function goneNamed(answer: unknown): string[] {
  if (!refusedGone(answer) || !("goneIds" in answer) || !Array.isArray(answer.goneIds)) return [];
  return answer.goneIds.filter((id): id is string => typeof id === "string");
}

/**
 * The answer of an action about one person (`updatePerson`, `setPersonLeg`), whose refusal
 * `personGone` names nobody: it names her, `personId` (`goneNamed`). Any other answer as it was.
 */
export function aboutPerson<T>(answer: T, personId: string): T {
  if (!refusedGone(answer) || "goneIds" in answer) return answer;
  return { ...answer, goneIds: [personId] };
}

/**
 * What the page shows of `next` while a sheet hides it, when `next` makes the tabs go or come
 * (epic #250, § 5): `next`, with `shown`'s end and retour leg, or none. A sheet on the retour
 * closes over it rather than going with it (rule 9); one on the aller is not mounted anew with
 * its panel, and keeps the legs it opened with (decision 41). Nothing to hold otherwise.
 */
export function withTabsHeld(shown: EventState, next: EventState): EventState | undefined {
  if (!shown.event.retourAt === !next.event.retourAt) return undefined;
  const legs = [...next.legs.filter(({ leg }) => leg !== "retour"), ...shown.legs.filter(({ leg }) => leg === "retour")];
  return { event: { ...next.event, retourAt: shown.event.retourAt }, options: next.options, legs };
}

/** The state an action's answer carries back, refusal included (C5.7, C11.6), if any. */
export function stateOf(answer: unknown): EventState | undefined {
  if (typeof answer !== "object" || answer === null || !("state" in answer)) return undefined;
  return isEventState(answer.state) ? answer.state : undefined;
}
