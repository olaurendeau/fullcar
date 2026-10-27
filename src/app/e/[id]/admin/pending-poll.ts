import { useEffect, useEffectEvent } from "react";
import type { Sent } from "../run-action";
import { pendingRead, pollsPending, POLL_MS, type ScreenEvent, type ScreenState } from "./screen-state";

/**
 * While the notice of `screen` says « Envoi du lien… » (OA1.7), reads the panel every POLL_MS
 * with `read`, and dispatches the notice it answers, until the notice says something else:
 * sent, failed, or none (OA2.6). The server reads a send left « sending » for more than 30 s
 * as a failure, so that this ends. A read that fails changes nothing: the next one is tried.
 * Each read waits for the one before; none is applied once polling has stopped.
 */
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
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      timer = setTimeout(async () => {
        const answer = pendingRead(await readPanel());
        if (stopped) return;
        if (answer) apply({ type: "pendingRead", ...answer });
        next();
      }, POLL_MS);
    };
    next();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [polls]);
}
