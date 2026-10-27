import type { Sent } from "@/app/e/[id]/run-action";
import { bound, type BrowserTokens } from "./sign-out-browser";

/**
 * « Supprimer mon compte » in this browser (OA9.4, OA9.5): `send` takes the session's token and
 * every admin token kept to `deleteAccount`, in its body. Once the server says the account is
 * deleted, the browser forgets what it sent; any other answer, offline included, keeps all of it:
 * nothing was erased, and the dialog says so.
 */
export async function deleteAccountBrowser(
  send: (session: string | undefined, adminTokens: string[]) => Promise<Sent<unknown>>,
  tokens: BrowserTokens = bound,
): Promise<"deleted" | "failed"> {
  const session = tokens.readSessionToken();
  const adminTokens = tokens.keptAdminTokens();
  const sent = await send(session, adminTokens);
  const answer = sent.ok && typeof sent.value === "object" && sent.value !== null ? (sent.value as { deleted?: unknown }) : undefined;
  if (answer?.deleted !== true) return "failed";
  if (session !== undefined) tokens.forgetSessionToken(session);
  tokens.forgetAdminTokens(adminTokens);
  return "deleted";
}
