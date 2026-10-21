/*
 * Where the focus goes after an action, by the README's table « Le focus après une action »
 * (docs/design/event-board/): plain DOM functions, called once the page has its new state.
 * Each says whether the focus is there: an element of the hidden tab's panel, which stays
 * mounted, does not take it.
 */
import type { Leg } from "@/domain/leg";

function focus(target: HTMLElement | null | undefined): boolean {
  target?.focus();
  return !!target && document.activeElement === target;
}

/**
 * Where the focus goes when what had it is gone (the bar closed from inside, a section that
 * no longer shows): the active tab, or the event's title without tabs.
 */
export function focusLandmark(): boolean {
  return focus(document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? document.getElementById("event-title"));
}

/**
 * Rule 8 of the bar (v4.2.2): the first of `landmarks` shown, else the active tab, or the
 * event's title. Never <body>; no tab is made active, no section unfolded.
 */
export function focusFirstShown(landmarks: readonly (() => boolean)[]) {
  if (!landmarks.some((landmark) => landmark())) focusLandmark();
}

/**
 * A first name or a cell of « Vos inscriptions »; while the section is folded, its button,
 * which stays folded and whose name carries the summary (v4-3, v4.1).
 */
function focusInSection(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector);
  const folded = target?.closest<HTMLElement>("[hidden]");
  const toggle = folded && document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(folded.id)}"]`);
  return focus(toggle || target);
}

/** The first name of person `id` in « Vos inscriptions », a button that never goes away. */
export function focusName(id: string): boolean {
  return focusInSection(`[data-person-name="${CSS.escape(id)}"]`);
}

/** The cell of person `id` on `leg` in « Vos inscriptions », a button that never goes away either. */
export function focusCell(id: string, leg: Leg): boolean {
  return focusInSection(`[data-person-cell="${CSS.escape(id)}"][data-leg="${leg}"]`);
}

/**
 * The title of car `rideId` on `leg`, focusable by `tabIndex={-1}`. The leg's tab is the
 * page's state: it is made active before, so that the title is shown when it is focused.
 * False when the car is not shown.
 */
export function focusCarTitle(leg: Leg, rideId: string): boolean {
  return focus(document.querySelector<HTMLElement>(`[data-car-title="${CSS.escape(rideId)}"][data-leg="${leg}"]`));
}

/** The coverage banner of `leg`, focusable by `tabIndex={-1}`; false when the leg shows none. */
export function focusBanner(leg: Leg): boolean {
  return focus(document.querySelector<HTMLElement>(`[data-leg-banner="${leg}"]`));
}

/** The landmark of a message about a car (README, « Le repère de chaque message »): its title, or its leg's banner once it is gone. */
export const focusCar = (leg: Leg, rideId: string) => () => focusCarTitle(leg, rideId) || focusBanner(leg);

/** « Ajouter une personne » of `leg`, on its tab; false while that tab is not the active one. */
export function focusAddPerson(leg: Leg): boolean {
  return focus(document.querySelector<HTMLElement>(`[data-add-person="${leg}"]`));
}

/** « Réessayer » of « Vos inscriptions », above the tabs, shown while their read has failed. */
export function focusRetry(): boolean {
  return focus(document.querySelector<HTMLElement>("[data-device-retry]"));
}
