import { useEffect, useEffectEvent } from "react";
import type { Sent } from "../run-action";
import { pendingRead, pollsPending, POLL_MS, type ScreenEvent, type ScreenState } from "./screen-state";

/**
 * The reads at most, POLL_MS apart: 30 s, the time after which the server reads a send left
 * « sending » as a failure (OA1.7). By then the server has answered something else, unless
 * the reads keep failing or answer something other than the panel.
 */
export const POLL_READS = 15;

/**
 * Reads the panel every POLL_MS with `read`, each read waiting for the one before, and
 * dispatches the notice it answers (`pendingRead`). Stops by itself once the notice says
 * something else than « sending »: sent, failed, or none (OA2.6). After POLL_READS reads still
 * « sending », or failed, or not the panel, it gives up (`pendingGaveUp`): the notice then
 * reads as a failure, as the server would read it by then. Returns what stops it: nothing is
 * read nor dispatched after, a read on its way included.
 */
export function startPendingPoll(read: () => Promise<Sent<unknown>>, dispatch: (event: ScreenEvent) => void): () => void {
  let stopped = false;
  let reads = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const next = () => {
    timer = setTimeout(async () => {
      const answer = pendingRead(await read());
      if (stopped) return;
      reads += 1;
      if (answer) dispatch({ type: "pendingRead", ...answer });
      if (answer && answer.pending?.send !== "sending") return;
      if (reads >= POLL_READS) return dispatch({ type: "pendingGaveUp" });
      next();
    }, POLL_MS);
  };
  next();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** While the notice of `screen` says « Envoi du lien… » (OA1.7), `startPendingPoll`, with the panel's own read. */
export function usePendingPoll(
  screen: ScreenState,
  read: () => Promise<Sent<unknown>>,
  dispatch: (event: ScreenEvent) => void,
): void {
  const polls = pollsPending(screen);
  const readPanel = useEffectEvent(read);
  const apply = useEffectEvent(dispatch);

  useEffect(() => {
    if (!polls) return;
    return startPendingPoll(
      () => readPanel(),
      (event) => apply(event),
    );
  }, [polls]);
}
