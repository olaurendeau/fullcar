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

/** The first name of person `id` in « Vos inscriptions », a button that never goes away. */
export function focusName(id: string) {
  document.querySelector<HTMLElement>(`[data-person-name="${CSS.escape(id)}"]`)?.focus();
}

/** The cell of person `id` on `leg` in « Vos inscriptions », a button that never goes away either. */
export function focusCell(id: string, leg: Leg) {
  document.querySelector<HTMLElement>(`[data-person-cell="${CSS.escape(id)}"][data-leg="${leg}"]`)?.focus();
}

/**
 * The title of car `rideId` on `leg`, focusable by `tabIndex={-1}`. The leg's tab is the
 * page's state: it is made active before, so that the title is shown when it is focused.
 */
export function focusCarTitle(leg: Leg, rideId: string) {
  document.querySelector<HTMLElement>(`[data-car-title="${CSS.escape(rideId)}"][data-leg="${leg}"]`)?.focus();
}
