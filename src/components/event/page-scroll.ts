/*
 * Where an open sheet gives the page back (event-board v4.6, rule 7, v4.6-15). Safari may scroll
 * the page behind a sheet to show a field: once the sheet is closed, that scroll is undone. What
 * the page scrolls itself meanwhile, like /admin keeping its board in place (O1.11), is not:
 * it goes through `scrollPageBy`, which moves where each open sheet gives the page back.
 */

/** Where a sheet gives the page back, `top` px from its top. */
export interface PagePlace {
  top: number;
}

const kept = new Set<PagePlace>();

/** Keeps where the page is now, until `release`: what a sheet gives back at its close. */
export function keepPagePlace(): { place: PagePlace; release: () => void } {
  const place = { top: window.scrollY };
  kept.add(place);
  return { place, release: () => void kept.delete(place) };
}

/** Scrolls the page by `top` px, at once, and every place kept by as much as it did scroll. */
export function scrollPageBy(top: number) {
  const before = window.scrollY;
  window.scrollBy({ top, behavior: "instant" });
  const scrolled = window.scrollY - before;
  for (const place of kept) place.top += scrolled;
}
