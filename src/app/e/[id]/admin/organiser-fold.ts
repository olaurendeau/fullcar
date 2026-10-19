import { isPublicId } from "@/domain/public-id-format";

/*
 * The only code that reads and writes whether the organiser's card is folded, on the
 * device and per event (O8.5). Its one key, `fullcar:organiser-folded:{id}`, holds the
 * event's public id and the value `1`: never a token, never a phone number (O2.10 amended).
 * The key exists only while the card is folded, and only for a public id. Nothing else is
 * stored: no other key, no other storage, no cookie. A storage that is missing or throws
 * reads as unfolded, and a write that fails is dropped, with no message and no log: the
 * screen's own state then keeps the card folded for the page.
 */

/** What is used of `localStorage`. */
export type FoldStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The event's own key: folding one event leaves every other unfolded. Only for a public
 * id: anything else, a token passed by mistake first, has no key and is never stored.
 */
function storageKey(id: string): string | null {
  return isPublicId(id) ? `fullcar:organiser-folded:${id}` : null;
}

const FOLDED = "1";

/**
 * The folded state's functions over a storage. `storage` is a getter: some browsers throw
 * on the `localStorage` property itself.
 */
export function organiserFold({ storage }: { storage: () => FoldStorage }) {
  /** Whether the card of event `id` was left folded: only when its key holds exactly "1". */
  function readFolded(id: string): boolean {
    const key = storageKey(id);
    if (key === null) return false;
    try {
      return storage().getItem(key) === FOLDED;
    } catch {
      return false;
    }
  }

  /** Keeps the card of event `id` folded (writes "1") or unfolded (removes the key). */
  function keepFolded(id: string, folded: boolean): void {
    const key = storageKey(id);
    if (key === null) return;
    try {
      if (folded) storage().setItem(key, FOLDED);
      else storage().removeItem(key);
    } catch {
      // Unavailable or full: the card stays as it is for this page only.
    }
  }

  return { readFolded, keepFolded };
}

export const { readFolded, keepFolded } = organiserFold({ storage: () => window.localStorage });
