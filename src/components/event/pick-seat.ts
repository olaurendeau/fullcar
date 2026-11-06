import type { Leg } from "@/domain/leg";
import type { VisibleLegBoard } from "@/domain/phone-visibility";

/**
 * « Trouver une place » for a person of another device (#983, PL3.8): the page is in a mode where
 * the next tap on a free seat of `leg` seats `personId` alone. The mode is the page's, not a
 * leg's or a sheet's: the person's sheet closes, and the seat belongs to another component.
 */
export interface PickSeat {
  personId: string;
  firstName: string;
  leg: Leg;
}

/**
 * What the page's mode is given, as `useSeatSheet` and the person's sheet see it. The mode is read
 * when a seat is tapped and never rendered: the page changes nothing as a sheet opens or closes
 * because of it (see `usePickSeat`).
 */
export interface PickSeatMode {
  /** The mode now, if there is one. */
  mode: () => PickSeat | null;
  /**
   * Enters the mode once no sheet hides the page, and writes `message` in the bar as the
   * information that says it (`OtherPerson.pickSeat`).
   */
  start: (mode: PickSeat, message: { text: string; landmark: () => boolean }) => void;
  /** A tap ends it: its information goes with it. */
  end: () => void;
}

/**
 * Whether the mode is over though nothing was tapped (PL3.8): the bar no longer says it
 * (« Fermer », Escape, or another information that replaced its line), or the active tab is not
 * its leg's. A tap ends it too, that is `useSeatSheet`'s to say, and a sheet that opens, that
 * is `usePickSeat`'s: it watches `onSheetOpen`.
 */
export function pickSeatEnded(mode: PickSeat | null, page: { tab: Leg; said: boolean }): boolean {
  return mode !== null && (!page.said || page.tab !== mode.leg);
}

/**
 * The person a tap on a free seat of `board` seats because of the mode: hers, on her leg, as long
 * as the leg still lists her without a car. Otherwise nobody: the tap follows `tapOutcome` (R5).
 */
export function pickedOn(mode: PickSeat | null, board: Pick<VisibleLegBoard, "leg" | "withoutCar">): { id: string; firstName: string } | undefined {
  if (!mode || mode.leg !== board.leg) return undefined;
  const person = board.withoutCar.find(({ id }) => id === mode.personId);
  return person && { id: person.id, firstName: person.firstName };
}
