/*
 * Where the focus goes after an action, by the README's table « Le focus après une action »
 * (docs/design/event-board/): plain DOM functions, called once the page has its new state.
 */

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
