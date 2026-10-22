import type { EventErrors, EventHeader } from "@/domain/event";
import type { Leg } from "@/domain/leg";
import type { OrganiserLeg } from "@/domain/organiser-panel";
import { isWallClock } from "@/domain/wall-clock";
import type { EventState } from "../event-state";
import { stateRead, type ActionProblem, type Sent } from "../run-action";
import type { AdminLinkCheck } from "./admin-link";

/*
 * The organiser area's state (epic #154, #182), pure: the first read of the panel and its
 * « Réessayer », then « Actualiser », a read of the screen that succeeds or fails as one
 * block, with one state and one message (O1.9); after an action of the board, the panel read
 * again, or withdrawn when that read fails (O1.10, #183).
 */

/**
 * The panel as last read: the two links, and its legs, or `null` once withdrawn (O1.10): the
 * links stay, the tiles and the sections go.
 */
export interface Panel {
  publicUrl: string;
  adminUrl: string;
  legs: OrganiserLeg[] | null;
}

/** The two lists of a leg's section (O5.6). */
export type OrganiserList = "withoutCar" | "carsWithoutPhone";

/** Which list of which leg is unfolded: `aller:withoutCar`, for one. */
export const listKey = (leg: Leg, list: OrganiserList) => `${leg}:${list}`;

/** The lines a long list shows before « Afficher les {n} autres » (O5.6). */
export const FOLDED_LINES = 5;

export type ScreenState =
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "failed"; retrying: boolean }
  | {
      state: "ready";
      panel: Panel;
      /** The number of the read running, if one is. */
      refreshing: number | null;
      /** The failures in a row, said by the alert until the next read starts. */
      refreshFailed: number;
      /** The last read succeeded, said by the status region. */
      refreshed: boolean;
      /** The lists unfolded, by `listKey`: kept through the reads, in memory alone (O5.7). */
      expanded: ReadonlySet<string>;
      /** The card folded (#204): read once, as the first panel arrives, then changed by its button alone. */
      folded: boolean;
    };

export type ScreenEvent =
  /**
   * The first read, a « Réessayer » starting (failed, retrying) or ending: what `useAdminLinkCheck`
   * says. With the panel, whether the card was left folded on the device (O8.5).
   */
  | { type: "checked"; check: AdminLinkCheck; folded?: boolean }
  | { type: "toggleFolded" }
  | { type: "refreshStarted"; read: number }
  /** With the panel's legs on a success; without, a failure. */
  | { type: "refreshEnded"; read: number; legs?: OrganiserLeg[] }
  /** The panel read again after an action of the board, the latest such read (O1.10): with its legs, or without on a failure. */
  | { type: "reread"; legs?: OrganiserLeg[] }
  | { type: "listToggled"; key: string };

function fromCheck(check: AdminLinkCheck, folded = false): ScreenState {
  switch (check.state) {
    case "checking":
      return { state: "loading" };
    case "invalid":
      return { state: "invalid" };
    case "failed":
      return { state: "failed", retrying: check.retrying ?? false };
    case "valid": {
      const { publicUrl, adminUrl, legs } = check;
      const panel = { publicUrl, adminUrl, legs };
      return { state: "ready", panel, refreshing: null, refreshFailed: 0, refreshed: false, expanded: new Set(), folded };
    }
  }
}

/** The lists still unfolded once `legs` are applied: one of 5 lines or fewer has no button, and folds for what follows (O5.7). */
function stillExpanded(expanded: ReadonlySet<string>, legs: OrganiserLeg[]): ReadonlySet<string> {
  const lists = ["withoutCar", "carsWithoutPhone"] as const;
  return new Set(
    legs.flatMap((leg) =>
      lists.filter((list) => expanded.has(listKey(leg.leg, list)) && leg[list].length > FOLDED_LINES).map((list) => listKey(leg.leg, list)),
    ),
  );
}

type Ready = Extract<ScreenState, { state: "ready" }>;

/** `legs` applied, the alert and the announcement gone, no read running: the panel and its unfolded lists. */
function applied(state: Ready, legs: OrganiserLeg[] | null, refreshed: boolean): Ready {
  const expanded = legs ? stillExpanded(state.expanded, legs) : state.expanded;
  return { ...state, panel: { ...state.panel, legs }, expanded, refreshing: null, refreshFailed: 0, refreshed };
}

/**
 * The next state. A refresh starts only on the panel, and while none runs (O1.8). Only the
 * latest read counts: the end of any other changes nothing, nor does it once the link was
 * checked again. A read after an action says nothing (O1.10): a success replaces the panel, a
 * failure withdraws it and empties the alert, so that one message is left, the action's in the
 * bar. Whether the card is folded, only its button changes (O8.6): no read, action nor failure.
 * It also ends a refresh still running, whose board was read before the action: the
 * organiser who asked for it hears its outcome, « actualisé » or the alert, withdrawn.
 */
export function screenReducer(state: ScreenState, event: ScreenEvent): ScreenState {
  if (event.type === "checked") return fromCheck(event.check, event.folded);
  if (state.state !== "ready") return state;
  if (event.type === "toggleFolded") return { ...state, folded: !state.folded };
  if (event.type === "reread") {
    // Ending a refresh, it is that refresh's outcome, said as a refresh says it (O1.9, O5.4).
    const refreshing = state.refreshing !== null;
    if (event.legs || !refreshing) return applied(state, event.legs ?? null, refreshing);
    return { ...applied(state, null, false), refreshFailed: state.refreshFailed + 1 };
  }
  if (event.type === "listToggled") {
    const expanded = new Set(state.expanded);
    if (!expanded.delete(event.key)) expanded.add(event.key);
    return { ...state, expanded };
  }
  if (event.type === "refreshStarted") {
    return state.refreshing === null ? { ...state, refreshing: event.read, refreshed: false } : state;
  }
  if (state.refreshing !== event.read) return state;
  if (!event.legs) return { ...state, refreshing: null, refreshFailed: state.refreshFailed + 1 };
  return applied(state, event.legs, true);
}

/** The panel's legs of a read of the panel, or nothing when it failed or the link is no longer valid. */
export function panelRead(panel: Sent<unknown>): OrganiserLeg[] | undefined {
  if (!panel.ok) return undefined;
  const answer = panel.value as { state?: unknown; legs?: unknown } | null | undefined;
  return answer?.state === "panel" && Array.isArray(answer.legs) ? (answer.legs as OrganiserLeg[]) : undefined;
}

/**
 * What a read of the screen gives, once both reads have ended: the panel's legs and the
 * board's state together, or nothing at all when either failed (O1.9). A link no longer
 * valid, or a board's state `undefined`, is a failure too.
 */
export function screenRead(
  panel: Sent<unknown>,
  board: Sent<EventState | undefined>,
): { legs: OrganiserLeg[]; board: EventState } | undefined {
  const legs = panelRead(panel);
  const state = stateRead(board);
  if (!legs || !state) return undefined;
  return { legs, board: state };
}

/**
 * What came of « Valider » in « Modifier l’événement » (organizer-view v3.3.6, « Enregistrer »):
 * saved, with the values the server stored; a field refused; or a problem, said in the sheet.
 */
export type EditAnswer =
  | { kind: "saved"; event: EventHeader }
  | { kind: "errors"; errors: EventErrors }
  | { kind: "problem"; problem: ActionProblem };

function isHeader(value: unknown): value is EventHeader {
  if (typeof value !== "object" || value === null) return false;
  const { title, location, allerAt, retourAt } = value as Record<string, unknown>;
  return typeof title === "string" && typeof location === "string" && isWallClock(allerAt) && (retourAt === null || isWallClock(retourAt));
}

/**
 * The answer of `updateEvent`, as the sheet takes it. Decision: `changed`, `confirmRetour`,
 * `invalid` and `eventNotFound` are the generic failure until #269 and #270 give them their
 * words. Reason: the epic's « Comportement transitoire »; nothing was written, the typing stays.
 */
export function editAnswer(sent: Sent<unknown>): EditAnswer {
  if (!sent.ok) return { kind: "problem", problem: sent.problem };
  const answer = sent.value as { ok?: unknown; event?: unknown; errors?: unknown } | null | undefined;
  if (answer?.ok === true && isHeader(answer.event)) return { kind: "saved", event: answer.event };
  if (answer?.ok === false && typeof answer.errors === "object" && answer.errors !== null) {
    return { kind: "errors", errors: answer.errors as EventErrors };
  }
  return { kind: "problem", problem: "failed" };
}

/**
 * What the live regions of the title line say (O1.8, O1.9, O5.4): « Actualisation… » while a
 * read runs, then its outcome. The alert is empty while a read runs, so that two failures in
 * a row are announced twice. Once the panel is withdrawn, the failure has its other body, with
 * no « last load » (O5.4).
 */
export function announcement(state: ScreenState): Said {
  if (state.state !== "ready") return "";
  if (state.refreshing !== null) return "refreshing";
  if (state.refreshFailed > 0) return state.panel.legs ? "failed" : "failedWithdrawn";
  return state.refreshed ? "refreshed" : "";
}

export type Said = "" | "refreshing" | "refreshed" | "failed" | "failedWithdrawn";

/**
 * What the alert's frame shows, a read running or not: the last failure stays on screen while
 * the next read runs, out of the emptied region, so that nothing under it moves (review of
 * #211). Once the panel is withdrawn, it shows in place of the withdrawal's sentence (O5.4).
 */
export function alertShown(state: ScreenState): "" | "body" | "bodyWithdrawn" {
  if (state.state !== "ready" || state.refreshFailed === 0) return "";
  return state.panel.legs ? "body" : "bodyWithdrawn";
}
