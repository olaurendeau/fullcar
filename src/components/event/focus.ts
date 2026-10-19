/*
 * Where the focus goes after an action, by the README's table « Le focus après une action »
 * (docs/design/event-board/): plain DOM functions, called once the page has its new state.
 */
import type { Leg } from "@/domain/leg";

/**
 * Where the focus goes when what had it is gone (the bar closed from inside, a section that
 * no longer shows): the active tab, or the event's title without tabs.
 */
export function focusLandmark() {
  const target =
    document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
    document.getElementById("event-title");
  target?.focus();
}

/**
 * A first name or a cell of « Vos inscriptions »; while the section is folded, its button,
 * which stays folded and whose name carries the summary (v4-3, v4.1).
 */
function focusInSection(selector: string) {
  const target = document.querySelector<HTMLElement>(selector);
  const folded = target?.closest<HTMLElement>("[hidden]");
  const toggle = folded && document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(folded.id)}"]`);
  (toggle || target)?.focus();
}

/** The first name of person `id` in « Vos inscriptions », a button that never goes away. */
export function focusName(id: string) {
  focusInSection(`[data-person-name="${CSS.escape(id)}"]`);
}

/** The cell of person `id` on `leg` in « Vos inscriptions », a button that never goes away either. */
export function focusCell(id: string, leg: Leg) {
  focusInSection(`[data-person-cell="${CSS.escape(id)}"][data-leg="${leg}"]`);
}

/** Focuses what `selector` finds, and says whether the focus is there: not in the hidden tab's panel, which stays mounted. */
function focusOn(selector: string): boolean {
  const target = document.querySelector<HTMLElement>(selector);
  target?.focus();
  return target !== null && document.activeElement === target;
}

/**
 * The title of car `rideId` on `leg`, focusable by `tabIndex={-1}`. The leg's tab is the
 * page's state: it is made active before, so that the title is shown when it is focused.
 * False when the car is not shown.
 */
export function focusCarTitle(leg: Leg, rideId: string): boolean {
  return focusOn(`[data-car-title="${CSS.escape(rideId)}"][data-leg="${leg}"]`);
}

/** The coverage banner of `leg`, focusable by `tabIndex={-1}`; false when the leg shows none. */
export function focusBanner(leg: Leg): boolean {
  return focusOn(`[data-leg-banner="${leg}"]`);
}
