import { whyOf, type NotDone, type Why } from "@/components/event/failure-words";
import type { LegCounts } from "@/db/legs";
import type { EventErrors, EventHeader } from "@/domain/event";
import type { Leg } from "@/domain/leg";
import type { OrganiserLeg, OrganiserPerson } from "@/domain/organiser-panel";
import { pendingNoticeOf, type PendingNotice } from "@/domain/pending-send";
import { positionOf } from "@/domain/place";
import { isWallClock } from "@/domain/wall-clock";
import type { EventState } from "../event-state";
import { stateRead, type ActionProblem, type Sent } from "../run-action";
import type { OrganiserCheck, Refusal } from "./admin-token-store";

/*
 * The organiser area's state (epic #154, #182), pure: the first read of the panel and its
 * « Réessayer », then « Actualiser », a read of the screen that succeeds or fails as one
 * block, with one state and one message (O1.9); after an action of the board, the panel read
 * again, or withdrawn when that read fails (O1.10, #183).
 */

/**
 * The panel as last read: the link to share, and its legs, or `null` once withdrawn (O1.10):
 * the link stays, the sections go. There is no organiser's link any more (OA7.3). `pending`, the
 * notice « Confirmez votre adresse » of an event awaiting confirmation (OA1.7, OA2.1).
 */
export interface Panel {
  publicUrl: string;
  legs: OrganiserLeg[] | null;
  pending?: PendingNotice;
}

/** The two lists of a leg's section (O5.6). */
export type OrganiserList = "withoutCar" | "carsWithoutPhone";

/** Which list of which leg is unfolded: `aller:withoutCar`, for one. */
export const listKey = (leg: Leg, list: OrganiserList) => `${leg}:${list}`;

/** The lines a long list shows before « Afficher les {n} autres » (O5.6). */
export const FOLDED_LINES = 5;

/** The list of « Personnes inscrites » in `expanded` (#672, RP4.3): the panel's rules for long lists. */
export const PERSONS_LIST = "persons";

export type ScreenState =
  | { state: "loading" }
  /** Refused, with the screen of why (#598). */
  | { state: "refused"; refusal: Refusal }
  | { state: "failed"; retrying: boolean }
  | {
      state: "ready";
      panel: Panel;
      /** Every person of the event, as the last panel read gives them (RP4.1): kept while the panel is withdrawn. */
      persons: OrganiserPerson[];
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
      /**
       * The legs whose section is unfolded (O9.5): none as the panel appears, then changed by their
       * buttons alone; kept through the reads, the panel withdrawn and the card folded, in memory alone.
       */
      unfolded: ReadonlySet<Leg>;
      /** « Personnes inscrites » unfolded (RP4.1): folded as the panel appears, then changed by its button alone, in memory alone. */
      personsOpen: boolean;
    };

export type ScreenEvent =
  /**
   * The first read, a « Réessayer » starting (failed, retrying) or ending: what `useOrganiserCheck`
   * says. With the panel, whether the card was left folded on the device (O8.5).
   */
  | { type: "checked"; check: OrganiserCheck; folded?: boolean }
  | { type: "toggleFolded" }
  | { type: "refreshStarted"; read: number }
  /** With the panel's legs and persons on a success; without, a failure. */
  | { type: "refreshEnded"; read: number; legs?: OrganiserLeg[]; persons?: OrganiserPerson[] }
  /** The panel read again after an action of the board, the latest such read (O1.10): with its legs, or without on a failure. */
  | { type: "reread"; legs?: OrganiserLeg[]; persons?: OrganiserPerson[] }
  | { type: "listToggled"; key: string }
  | { type: "legToggled"; leg: Leg }
  | { type: "personsToggled" }
  /** The notice read again while its email is on its way (OA1.7): without one, it goes (OA2.6). */
  | { type: "pendingRead"; pending?: PendingNotice }
  /** No result read in 30 s (POLL_READS): the notice still « sending » reads as a failure, as the server's rule says. */
  | { type: "pendingGaveUp" };

function fromCheck(check: OrganiserCheck, folded = false): ScreenState {
  switch (check.state) {
    case "checking":
      return { state: "loading" };
    case "refused":
      return { state: "refused", refusal: check.refusal };
    case "failed":
      return { state: "failed", retrying: check.retrying ?? false };
    case "valid": {
      const { publicUrl, legs, persons, pending } = check;
      const panel = { publicUrl, legs, ...(pending && { pending }) };
      const fresh = { expanded: new Set<string>(), unfolded: new Set<Leg>(), personsOpen: false };
      return { state: "ready", panel, persons, refreshing: null, refreshFailed: 0, refreshed: false, folded, ...fresh };
    }
  }
}

/** The lists still unfolded once `legs` are applied: one of 5 lines or fewer has no button, and folds for what follows (O5.7, RP4.3). */
function stillExpanded(expanded: ReadonlySet<string>, legs: OrganiserLeg[], persons: OrganiserPerson[]): ReadonlySet<string> {
  const lists = ["withoutCar", "carsWithoutPhone"] as const;
  const long = expanded.has(PERSONS_LIST) && persons.length > FOLDED_LINES ? [PERSONS_LIST] : [];
  return new Set([
    ...legs.flatMap((leg) =>
      lists.filter((list) => expanded.has(listKey(leg.leg, list)) && leg[list].length > FOLDED_LINES).map((list) => listKey(leg.leg, list)),
    ),
    ...long,
  ]);
}

type Ready = Extract<ScreenState, { state: "ready" }>;

/** The legs still unfolded once `legs` are applied: a leg gone takes its state with it, and comes back folded (O9.5). */
function stillUnfolded(unfolded: ReadonlySet<Leg>, legs: OrganiserLeg[]): ReadonlySet<Leg> {
  return new Set(legs.map((leg) => leg.leg).filter((leg) => unfolded.has(leg)));
}

/**
 * `legs` applied, the alert and the announcement gone, no read running: the panel, its unfolded
 * lists and legs. Withdrawn (`legs` null), all, persons too, are kept for the read that gives the panel back (decision 58).
 */
function applied(state: Ready, legs: OrganiserLeg[] | null, refreshed: boolean, read: OrganiserPerson[] = []): Ready {
  const persons = legs ? read : state.persons;
  const expanded = legs ? stillExpanded(state.expanded, legs, persons) : state.expanded;
  const unfolded = legs ? stillUnfolded(state.unfolded, legs) : state.unfolded;
  return { ...state, panel: { ...state.panel, legs }, persons, expanded, unfolded, refreshing: null, refreshFailed: 0, refreshed };
}

/**
 * The next state. A refresh starts only on the panel, and while none runs (O1.8). Only the
 * latest read counts: the end of any other changes nothing, nor does it once the link was
 * checked again. A read after an action says nothing (O1.10): a success replaces the panel, a
 * failure withdraws it and empties the alert, so that one message is left, the action's in the
 * bar. Whether the card is folded, only its button changes (O8.6): no read, action nor failure;
 * whether a leg is, its button, or the read that takes that leg away (O9.5); whether
 * « Personnes inscrites » is, its button alone (RP4.1).
 * It also ends a refresh still running, whose board was read before the action: the
 * organiser who asked for it hears its outcome, « actualisé » or the alert, withdrawn.
 */
export function screenReducer(state: ScreenState, event: ScreenEvent): ScreenState {
  if (event.type === "checked") return fromCheck(event.check, event.folded);
  if (state.state !== "ready") return state;
  if (event.type === "toggleFolded") return { ...state, folded: !state.folded };
  if (event.type === "personsToggled") return { ...state, personsOpen: !state.personsOpen };
  if (event.type === "pendingRead") {
    const { publicUrl, legs } = state.panel;
    return { ...state, panel: { publicUrl, legs, ...(event.pending && { pending: event.pending }) } };
  }
  if (event.type === "pendingGaveUp") {
    const { pending } = state.panel;
    return pending?.send === "sending" ? { ...state, panel: { ...state.panel, pending: { ...pending, send: "failed" } } } : state;
  }
  if (event.type === "reread") {
    // Ending a refresh, it is that refresh's outcome, said as a refresh says it (O1.9, O5.4).
    const refreshing = state.refreshing !== null;
    if (event.legs || !refreshing) return applied(state, event.legs ?? null, refreshing, event.persons);
    return { ...applied(state, null, false), refreshFailed: state.refreshFailed + 1 };
  }
  if (event.type === "legToggled") {
    const unfolded = new Set(state.unfolded);
    if (!unfolded.delete(event.leg)) unfolded.add(event.leg);
    return { ...state, unfolded };
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
  return applied(state, event.legs, true, event.persons);
}

/** How often the notice is read again while its email is on its way (OA1.7: its result within 15 s of the arrival). */
export const POLL_MS = 2_000;

/** Whether the notice is read again: on the panel, while its email is on its way. */
export function pollsPending(state: ScreenState): boolean {
  return state.state === "ready" && state.panel.pending?.send === "sending";
}

/**
 * The notice of a read of the panel, `{}` for a panel without one (OA2.6); nothing to apply
 * when the read failed or did not answer the panel.
 */
export function pendingRead(panel: Sent<unknown>): { pending?: PendingNotice } | undefined {
  if (!panel.ok) return undefined;
  const answer = panel.value as { state?: unknown; pending?: unknown } | null | undefined;
  if (answer?.state !== "panel") return undefined;
  const pending = pendingNoticeOf(answer.pending);
  return pending ? { pending } : {};
}

/** What a read of the panel shows: its legs, and every person (none from a server before #671). */
export interface PanelBody {
  legs: OrganiserLeg[];
  persons: OrganiserPerson[];
}

/** The panel's legs and persons of a read of the panel, or nothing when it failed or the link is no longer valid. */
export function panelRead(panel: Sent<unknown>): PanelBody | undefined {
  if (!panel.ok) return undefined;
  const answer = panel.value as { state?: unknown; legs?: unknown; persons?: unknown } | null | undefined;
  if (answer?.state !== "panel" || !Array.isArray(answer.legs)) return undefined;
  return { legs: answer.legs as OrganiserLeg[], persons: Array.isArray(answer.persons) ? (answer.persons as OrganiserPerson[]) : [] };
}

/**
 * What a read of the screen gives, once both reads have ended: the panel's legs and persons and
 * the board's state together, or nothing at all when either failed (O1.9). A link no longer
 * valid, or a board's state `undefined`, is a failure too.
 */
export function screenRead(panel: Sent<unknown>, board: Sent<EventState | undefined>): (PanelBody & { board: EventState }) | undefined {
  const body = panelRead(panel);
  const state = stateRead(board);
  if (!body || !state) return undefined;
  return { ...body, board: state };
}

/**
 * What came of « Valider » in « Modifier l’événement » (organizer-view v3.3.6, « Enregistrer »):
 * saved, with the values the server stored; a field refused; changed on another device, with
 * the values stored (M6.1); the retour unchecked still holding these, to confirm (M3.2); the
 * link refused (M8.2) or the event gone (M8.3); or a problem, said in the sheet.
 */
export type EditAnswer =
  | { kind: "saved"; event: EventHeader }
  | { kind: "errors"; errors: EventErrors }
  | { kind: "changed"; event: EventHeader }
  | { kind: "confirmRetour"; counts: LegCounts }
  | { kind: "refused"; reason: "invalid" | "eventNotFound" }
  | { kind: "problem"; problem: ActionProblem };

/**
 * A header with its position, `null` or one: the server always sends it. Its description is a
 * text, `null`, or absent, from a server before the description: the form then loads none.
 */
function isHeader(value: unknown): value is EventHeader {
  if (typeof value !== "object" || value === null) return false;
  const { title, location, locationPosition, allerAt, retourAt, description } = value as Record<string, unknown>;
  return (
    typeof title === "string" &&
    typeof location === "string" &&
    !("error" in positionOf(locationPosition)) &&
    isWallClock(allerAt) &&
    (retourAt === null || isWallClock(retourAt)) &&
    (description === undefined || description === null || typeof description === "string")
  );
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/**
 * What the change did not do, then why, once its sheet is closed (« Une réponse qui arrive
 * feuille fermée », M2.8, M2.9), in the bar. A `removal` confirmed did not remove the retour
 * either, and new numbers are said with what to use again (M3.7). `invalid`, which only a forged
 * request gets, takes the generic reason (decision 46).
 */
export function editFailure(answer: Exclude<EditAnswer, { kind: "saved" }>, removal: boolean): { notDone: NotDone; why: Why } {
  const notDone: NotDone = { kind: removal ? "removeRetour" : "editEvent" };
  switch (answer.kind) {
    case "problem":
      return { notDone, why: whyOf(answer.problem) };
    case "refused":
      return { notDone, why: whyOf(answer.reason) };
    case "errors":
      return { notDone, why: whyOf("editErrors") };
    case "changed":
      return { notDone, why: whyOf("eventChanged") };
    case "confirmRetour":
      return { notDone, why: removal ? { kind: "retourChanged", ...answer.counts, where: "bar" } : whyOf("retourNotConfirmed") };
  }
}

/** The answer of `updateEvent`, as the sheet takes it: anything else is the generic failure. */
export function editAnswer(sent: Sent<unknown>): EditAnswer {
  if (!sent.ok) return { kind: "problem", problem: sent.problem };
  const answer = sent.value as
    | { ok?: unknown; event?: unknown; errors?: unknown; error?: unknown; cars?: unknown; persons?: unknown }
    | null
    | undefined;
  if (answer?.ok === false && answer.error === "confirmRetour" && isCount(answer.cars) && isCount(answer.persons)) {
    return { kind: "confirmRetour", counts: { cars: answer.cars, persons: answer.persons } };
  }
  if (answer?.ok === true && isHeader(answer.event)) return { kind: "saved", event: answer.event };
  if (answer?.ok === false && typeof answer.errors === "object" && answer.errors !== null) {
    return { kind: "errors", errors: answer.errors as EventErrors };
  }
  if (answer?.ok === false && answer.error === "changed" && isHeader(answer.event)) return { kind: "changed", event: answer.event };
  if (answer?.ok === false && (answer.error === "invalid" || answer.error === "eventNotFound")) {
    return { kind: "refused", reason: answer.error };
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
