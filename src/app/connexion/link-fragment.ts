import { isTokenShaped } from "../session-token";

/**
 * The token of a link's page, from `location.hash` (OA5.1, OA5.7): what follows the `#`, if it
 * has the shape of a token. Anything else, a fragment cut by a character included, is none, and the
 * page says the link is not valid without asking the server. Pure: it reads the string it is
 * given, never the address bar. `link-page.tsx` reads `location.hash` and gives it, at render to
 * tell a fragment that is no token, and `link-browser.ts` calls it on the press of the button.
 */
export function linkTokenOf(hash: string): string | undefined {
  const token = hash.startsWith("#") ? hash.slice(1) : undefined;
  return token !== undefined && isTokenShaped(token) ? token : undefined;
}
