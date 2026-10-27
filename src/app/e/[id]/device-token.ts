import { useEffect, useEffectEvent, useState } from "react";
import { uuidV4FromBytes } from "@/domain/creation-id";
import { isPersonalToken, PERSONAL_TOKEN_BYTES, personalTokenFromBytes } from "@/domain/personal-token";
import { afterRegistration, type DeviceStatus } from "@/domain/tap";

/*
 * The only browser code that touches the personal token (docs/agents/architecture.md,
 * "Jetons"), as admin-token-store.ts is for the organiser's. The browser draws it with
 * `crypto.getRandomValues` and stores it under a key of its event before the request that
 * creates a person leaves (D1, D4); without `localStorage`, the page's memory keeps it (D5).
 * It travels in the body of a request only: never in a URL, a log, an error or the page.
 */

/** What is used of `localStorage`. */
export type DeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Fills `bytes` from a CSPRNG: `crypto.getRandomValues`, or what a test gives instead. */
export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => void;

function drawn(random: RandomBytes, length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  random(bytes);
  return bytes;
}

/** The event's own key: the token of one event is worth nothing on another (C1.7). */
function storageKey(id: string): string {
  return `fullcar:personal-token:${id}`;
}

/** A fixed key, which names no event: probing writes nothing for any event (C1.13). */
const PROBE_KEY = "fullcar:storage-probe";

const UUID_BYTES = 16;

/**
 * The personal token's functions over a storage and a source of randomness. `storage` is a
 * getter: some browsers throw on the `localStorage` property itself.
 */
export function deviceTokens({ storage, random }: { storage: () => DeviceStorage; random: RandomBytes }) {
  /** The page's memory, for a device whose `localStorage` fails (D5). */
  const memory = new Map<string, string>();

  function stored(id: string): string | undefined {
    try {
      const token = storage().getItem(storageKey(id));
      return isPersonalToken(token) ? token : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Whether `localStorage` keeps what it is given: the form warns before a registration when
   * it does not (C1.14). A storage that accepts a write and keeps nothing does not.
   */
  function storageAvailable(): boolean {
    try {
      const probed = storage();
      probed.setItem(PROBE_KEY, PROBE_KEY);
      const kept = probed.getItem(PROBE_KEY) === PROBE_KEY;
      probed.removeItem(PROBE_KEY);
      return kept;
    } catch {
      return false;
    }
  }

  /**
   * The device's token for event `id`, if it has one. Reads only; a malformed token is none.
   * The page's memory first: once this page keeps its token there, a token another tab
   * stores later for the same event does not change who this page is (C1.14).
   */
  function readDeviceToken(id: string): string | undefined {
    return memory.get(id) ?? stored(id);
  }

  /**
   * The device's token for event `id`, drawn if it has none yet. Called only when a creation
   * is sent, and before it is: the token is stored when this returns (C1.5, D4).
   *
   * Two tabs registering at once (#82): the stored token is read just before the request
   * leaves, and after the write too, so that a token another tab stored meanwhile is the one
   * sent, and both persons share it. The page's memory serves only when nothing is stored.
   * A window remains: a browser passes `localStorage` writes from one tab to another
   * asynchronously (a few milliseconds in Chrome), and two tabs that both read an empty key
   * within it each keep their own token.
   */
  function ensureDeviceToken(id: string): string {
    const existing = readDeviceToken(id);
    if (existing) return existing;
    const token = personalTokenFromBytes(drawn(random, PERSONAL_TOKEN_BYTES));
    try {
      storage().setItem(storageKey(id), token);
    } catch {
      // Unavailable or full: the memory below keeps it.
    }
    const kept = stored(id);
    if (kept !== undefined) return kept;
    memory.set(id, token);
    return token;
  }

  /** The creation id of a new row, drawn before the request is sent (C12.4). */
  function newCreationId(): string {
    return uuidV4FromBytes(drawn(random, UUID_BYTES));
  }

  return { storageAvailable, readDeviceToken, ensureDeviceToken, newCreationId };
}

export const { storageAvailable, readDeviceToken, ensureDeviceToken, newCreationId } = deviceTokens({
  storage: () => window.localStorage,
  random: (bytes) => {
    crypto.getRandomValues(bytes);
  },
});

/**
 * Reads the device's persons on an event, given its token: `none` without a token, without
 * asking anything; otherwise `loading`, then `ready` once `loaded` has the answer, or
 * `failed`. Returns what stops it: an answer that comes after changes nothing.
 */
export function startDevice<T>(
  token: string | undefined,
  load: (token: string) => Promise<T>,
  loaded: (value: T) => void,
  report: (status: DeviceStatus) => void,
): () => void {
  if (token === undefined) {
    report("none");
    return () => {};
  }
  let live = true;
  report("loading");
  load(token).then(
    (value) => {
      if (!live) return;
      loaded(value);
      report("ready");
    },
    () => {
      if (live) report("failed");
    },
  );
  return () => {
    live = false;
  };
}

/**
 * The device's state on event `id` (`DeviceStatus`): `pending` until the browser has read
 * its key, then as `startDevice` says. `load` reads the device's persons with the token, and
 * `loaded` receives its answer. `retry` loads again, after a failure. `registered` says a
 * person was just registered: a device without one is ready, with no reload (C2.2, C3.6).
 * Writes nothing (C1.13).
 */
export function useDevice<T>(
  id: string,
  load: (token: string) => Promise<T>,
  loaded: (value: T) => void,
): { status: DeviceStatus; retry: () => void; registered: () => void } {
  const [status, setStatus] = useState<DeviceStatus>("pending");
  const [attempt, setAttempt] = useState(0);
  const onLoad = useEffectEvent(load);
  const onLoaded = useEffectEvent(loaded);

  useEffect(
    () => startDevice(readDeviceToken(id), (token) => onLoad(token), (value: T) => onLoaded(value), setStatus),
    [id, attempt],
  );

  return {
    status,
    retry: () => setAttempt((count) => count + 1),
    registered: () => setStatus(afterRegistration),
  };
}
