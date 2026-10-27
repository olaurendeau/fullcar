import { forgetAdminTokens, keptAdminTokens } from "@/app/e/[id]/admin/admin-token-store";
import type { Sent } from "@/app/e/[id]/run-action";
import { forgetSessionToken, readSessionToken } from "@/app/session-token";

/** What the browser keeps, through session-token.ts and admin-token-store.ts, the only modules that touch it. */
export interface BrowserTokens {
  readSessionToken(): string | undefined;
  keptAdminTokens(): string[];
  forgetSessionToken(token: string): void;
  forgetAdminTokens(tokens: readonly string[]): void;
}

const bound: BrowserTokens = { readSessionToken, keptAdminTokens, forgetSessionToken, forgetAdminTokens };

/**
 * « Se déconnecter » in this browser (OA9.1, OA9.2): `send` takes the session's token and every
 * admin token kept to `signOut`, in its body. Once the server says signed out, the browser
 * forgets what it sent; any other answer, offline included, keeps all of it, the session open.
 */
export async function signOutBrowser(
  send: (session: string | undefined, adminTokens: string[]) => Promise<Sent<unknown>>,
  tokens: BrowserTokens = bound,
): Promise<"signedOut" | "failed"> {
  const session = tokens.readSessionToken();
  const adminTokens = tokens.keptAdminTokens();
  const sent = await send(session, adminTokens);
  const answer = sent.ok && typeof sent.value === "object" && sent.value !== null ? (sent.value as { signedOut?: unknown }) : undefined;
  if (answer?.signedOut !== true) return "failed";
  if (session !== undefined) tokens.forgetSessionToken(session);
  tokens.forgetAdminTokens(adminTokens);
  return "signedOut";
}
