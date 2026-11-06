import { useCallback, useEffect, useRef } from "react";
import type { Leg } from "@/domain/leg";
import { picksSeat, type Information } from "./bar-state";
import { onSheetOpen, whenPageShown } from "./hidden-page";
import type { useMessageBar } from "./message-bar";
import { pickSeatEnded, type PickSeat, type PickSeatMode } from "./pick-seat";

/**
 * The page's mode of « Trouver une place » for a person of another device (#983, PL3.8). It starts
 * once the person's sheet is gone, with its information in the bar; it ends when the bar no
 * longer says it (« Fermer », Escape, another information, the action a tap begins), when the
 * active tab is not its leg's, and when a sheet opens, the page showing no seat meanwhile.
 *
 * Held in a ref, never in a state: the page's root that rendered as a sheet opens or closes would make
 * Next mount the sheet twice, as the history entry it adds takes the page through a transition. For the
 * same reason the bar's line goes once no sheet hides the page.
 */
export function usePickSeat(
  messages: Pick<ReturnType<typeof useMessageBar>, "state" | "unpick">,
  tab: Leg,
  inform: (message: Omit<Information, "at">, leg: Leg) => void,
): PickSeatMode {
  const current = useRef<PickSeat | null>(null);
  const { unpick } = messages;
  const end = useCallback(() => {
    current.current = null;
    whenPageShown(unpick);
  }, [unpick]);

  const said = picksSeat(messages.state);
  useEffect(() => {
    if (pickSeatEnded(current.current, { tab, said })) end();
  }, [tab, said, end]);
  useEffect(
    () =>
      onSheetOpen(() => {
        if (current.current) end();
      }),
    [end],
  );

  return {
    mode: () => current.current,
    // The line first, the mode after it: a mode whose line is not in the bar is over.
    start: (next, message) => {
      inform({ ...message, picksSeat: true }, next.leg);
      whenPageShown(() => {
        current.current = next;
      });
    },
    end,
  };
}
