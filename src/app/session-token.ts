/*
 * The only browser code that touches the session's token (docs/agents/architecture.md,
 * « Session, liens et jeton d'admin », #595), as device-token.ts is for the personal one.
 * Its one key, `fullcar:session`, in `localStorage`, holds the token the server drew when
 * the session opened. The token travels in the body of a server action only: never in a
 * URL, a header, a cookie, a log, an error or the page. A storage that is missing or throws
 * reads as no session, with no message.
 */

/** What is used of `localStorage`. */
export type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY = "fullcar:session";

/**
 * The shape server-token.ts draws: 22 base64url characters for exactly 16 bytes, whose
 * last character can only be A, Q, g or w. Anything else kept under the key is no token.
 */
const FORMAT = /^[A-Za-z0-9_-]{21}[AQgw]$/;

/** Whether `value` has the shape of a token the server draws: a session's, or a link's (connexion/link-fragment.ts). */
export const isTokenShaped = (value: string): boolean => FORMAT.test(value);

/** What became of a page load's visit: none sent, the session open, ended, or no answer that says. */
export type VisitOutcome = "none" | "open" | "ended" | "failed";

/**
 * The session token's functions over a storage. `storage` is a getter: some browsers throw
 * on the `localStorage` property itself.
 */
export function sessionTokens({ storage }: { storage: () => TokenStorage }) {
  /** The browser's session token, if it keeps one. Reads only; a malformed value is none. */
  function readSessionToken(): string | undefined {
    try {
      const token = storage().getItem(KEY);
      return typeof token === "string" && FORMAT.test(token) ? token : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Keeps the token a link just opened a session with, in place of the one kept, whoever's it
   * was (OA5.9). Says whether it did: a storage that refuses leaves the browser without the
   * session, and the page must not say it opened.
   */
  function keepSessionToken(token: string): boolean {
    if (!FORMAT.test(token)) return false;
    try {
      storage().setItem(KEY, token);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Removes `token`, only if it is still the one kept: another tab may have opened a new
   * session meanwhile, which stays.
   */
  function forget(token: string): void {
    try {
      const kept = storage();
      if (kept.getItem(KEY) === token) kept.removeItem(KEY);
    } catch {
      // Unavailable: there is nothing to forget.
    }
  }

  /**
   * The visit of a page load (OA9.6, OA9.7): `send` takes the token to the `visit` action,
   * and nothing is sent without one. A session the server says ended never comes back, and
   * its token is forgotten. A failed request, or an answer of another shape, says nothing
   * of the session: the token is kept.
   */
  async function sendVisit(send: (token: string) => Promise<unknown>): Promise<VisitOutcome> {
    const token = readSessionToken();
    if (token === undefined) return "none";
    let answer: unknown;
    try {
      answer = await send(token);
    } catch {
      return "failed";
    }
    const session = typeof answer === "object" && answer !== null ? (answer as { session?: unknown }).session : undefined;
    if (session === "ended") forget(token);
    return session === "open" || session === "ended" ? session : "failed";
  }

  /** « Se déconnecter » (OA9.1): the browser forgets the token it sent, unless another tab has replaced it. */
  const forgetSessionToken = forget;

  return { readSessionToken, keepSessionToken, sendVisit, forgetSessionToken };
}

export const { readSessionToken, keepSessionToken, sendVisit, forgetSessionToken } = sessionTokens({ storage: () => window.localStorage });
