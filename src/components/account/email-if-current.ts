import type { Sent } from "@/app/e/[id]/run-action";

/**
 * The address `ask` answers with, if the session it was asked for is still the one the bar speaks of when
 * the answer arrives: an answer that comes after « Se déconnecter » (or after another link's arrival) is
 * dropped, so that the bar never shows a closed session's address. A failure says nothing.
 */
export async function emailIfCurrent(ask: () => Promise<Sent<unknown>>, stillCurrent: () => boolean): Promise<string | undefined> {
  const sent = await ask();
  if (!stillCurrent() || !sent.ok) return undefined;
  const answer = sent.value as { email?: unknown } | null;
  return typeof answer?.email === "string" ? answer.email : undefined;
}
