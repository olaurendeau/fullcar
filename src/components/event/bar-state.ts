/*
 * What the message bar shows (« La barre de messages », docs/design/event-board/README.md,
 * v4.2.3, #216): the last success, the last information and every failure still waiting. The
 * only place that decides it: pure functions over a state that `useMessageBar` keeps.
 */
import { otherLeg as otherLegOf, type Leg } from "@/domain/leg";

/**
 * « Annuler » of a placement (rule 6): what it sends. One per placement: the success's and the
 * failure of its undo carry the same.
 */
export interface Undo {
  run: () => void;
  /** The leg of the placement: a line that carries it is about that leg (`retourGone`). */
  leg?: Leg;
}

/**
 * A message: its words, its landmark, which takes the focus and says whether it is shown (rule
 * 8), its « Annuler », and the leg it is about, if one: those about the retour go with it
 * (`retourGone`). What says that the retour is gone is about no leg.
 */
export interface Message {
  text: string;
  landmark: () => boolean;
  undo?: Undo;
  leg?: Leg;
  /** The persons a placement's success seats: it is about them alone (`persons` withdrawal). */
  persons?: readonly string[];
}

/**
 * What a send was about: its subjects, each subject's fields after it (#208), and its number;
 * for a placement's success, the persons it seats, whom it is about instead.
 */
export interface Sent {
  about: readonly string[];
  sent: number;
  persons?: readonly string[];
}

/**
 * A failure, with what its send was about, and whether nothing left for want of a connection.
 * One about the aller too has its `aller` part: what it says, is about, and takes the focus to,
 * once the retour is gone (the owner's decision on #267).
 */
export interface Failure extends Message, Sent {
  offline?: boolean;
  aller?: { text: string; about: readonly string[]; landmark: () => boolean };
  /** Cut to its `aller` part by `retourGone`, the one place that changes a line's words in place (`cutSince`). */
  cut?: true;
}

/** An information, and when it was written, on the clock that also stamps when each action begins (`ended`). */
export interface Information extends Message {
  at: number;
  /** It says the retour is gone (`Actions.info.noRetour*`, decision 45): it goes once it is back (`retourBack`). */
  saysRetourGone?: true;
}

/** A line of the bar; `id` is the order in which it was written, which makes it recent (rule 1). */
export type Line = { id: number } & (({ kind: "failure" } & Failure) | ({ kind: "success" } & Message) | ({ kind: "info" } & Information));

export interface BarState {
  lines: readonly Line[];
  next: number;
  /** The last line written in each live region: a region says it while it is in the bar. */
  alert?: number;
  status?: number;
}

export const emptyBar: BarState = { lines: [], next: 1 };

/**
 * What takes failures away (rule 5). A send takes those whose subjects and fields it all
 * carries; its answer, only those of earlier sends (`before`). A car removed takes all those
 * about its subjects (`gone`), whatever fields they carried, sent before its removal. Persons
 * gone from the state the page shows take what is about them alone (`persons`, remove-person v2).
 */
export type Withdrawal =
  | { about: readonly string[]; before?: number }
  | { gone: readonly string[]; before: number }
  | { persons: readonly string[] };

export function covers(withdrawal: Withdrawal, { about, sent, persons }: Sent): boolean {
  if ("persons" in withdrawal) {
    const named = persons ?? about.map(personOf);
    return named.length > 0 && named.every((person) => person !== undefined && withdrawal.persons.includes(person));
  }
  if (withdrawal.before !== undefined && sent >= withdrawal.before) return false;
  if ("gone" in withdrawal) return withdrawal.gone.includes(about[0]);
  return about.every((subject) => withdrawal.about.includes(subject));
}

/**
 * The one person a subject is about, if it is about one of the device's persons alone: her
 * « Modifier » (`person:{id}`, and its fields), a cell of hers (`cell:{id}:{leg}`), her removal
 * (`removePerson:{id}`), or an offer she drives (`offer:{leg}:{id}`). Nobody for a car, a seat,
 * the page, or a person not created yet (`person:new:…`, `offer:{leg}:new:…`).
 */
function personOf(subject: string): string | undefined {
  const [kind, first, second] = subject.split(":");
  if (kind === "cell" || kind === "removePerson") return first;
  if (kind === "person") return first === "new" ? undefined : first;
  if (kind === "offer") return second === "new" ? undefined : second;
  return undefined;
}

/** A person's state on a leg, the key of what a placement's success says (rule 2, v4.4.5). */
export const personLeg = (personId: string, leg: Leg): string => `${personId}:${leg}`;

/** The person of a `personLeg` key. */
export const personOfLeg = (key: string): string => key.slice(0, key.lastIndexOf(":"));

/**
 * What « Proposer une voiture » changes once it succeeds (rule 2, v4.4.5, item 1): who drives, the
 * device's or the new person drawn, and who boards, on the car's leg; and who drives on the other
 * leg, unless she stays as she was there (`keep`, « Je reste dans la voiture de… » included).
 */
export function offerChanges({
  driver,
  newPersonId,
  passengerIds,
  leg,
  otherLeg,
}: {
  driver: { kind: "new" } | { kind: "device"; personId: string };
  newPersonId: string;
  passengerIds: readonly string[];
  leg: Leg;
  otherLeg?: { kind: string };
}): string[] {
  const driverId = driver.kind === "new" ? newPersonId : driver.personId;
  const there = otherLeg && otherLeg.kind !== "keep" ? [personLeg(driverId, otherLegOf(leg))] : [];
  return [driverId, ...passengerIds].map((personId) => personLeg(personId, leg)).concat(there);
}

/**
 * What a send changed once it succeeded, each person on a leg (`personLeg`), and its number; or
 * what a placement's success held under a sheet says, and its send's number.
 */
export interface Change {
  persons: readonly string[];
  sent: number;
}

/**
 * Rule 2 (v4.4.5-1, -2, -4): a placement's success that waits is never written once a send made
 * after it has succeeded in changing one of its persons on its leg, the whole success. Other
 * persons, or the other leg, leave it true. A send that failed or was refused changed nothing.
 */
export const madeUntrue = (held: Change, since: Iterable<Change>): boolean =>
  [...since].some((change) => change.sent > held.sent && change.persons.some((person) => held.persons.includes(person)));

const keep = (state: BarState, kept: (line: Line) => boolean): BarState => ({ ...state, lines: state.lines.filter(kept) });

function write(state: BarState, line: Line, kept: (line: Line) => boolean): BarState {
  const region = line.kind === "failure" ? "alert" : "status";
  return { ...state, lines: [...state.lines.filter(kept), line], next: line.id + 1, [region]: line.id };
}

/*
 * The information goes with the end of an action (`ended`), never with its words: the success or
 * the failure of an action that began after it is written once that action has ended (rules 2
 * and 3), and those of an action that began before it leave it (#339).
 */

/** Rule 2: an action that succeeds replaces the success, or removes it without words. Never a failure. */
export const succeed = (state: BarState, message: Message | null): BarState =>
  message
    ? write(state, { ...message, kind: "success", id: state.next }, (line) => line.kind !== "success")
    : keep(state, (line) => line.kind !== "success");

/** Rule 3: an action that fails adds its failure, and removes nothing. */
export const fail = (state: BarState, failure: Failure): BarState => write(state, { ...failure, kind: "failure", id: state.next }, () => true);

/** Rule 4: an information replaces the information, and nothing else. */
export const inform = (state: BarState, information: Information): BarState =>
  write(state, { ...information, kind: "info", id: state.next }, (line) => line.kind !== "info");

/**
 * Rule 4: the information goes once an action that `began` after it was written ends, whatever
 * came of it. One that began before it, a tap answered late, leaves it (#339).
 */
export const ended = (state: BarState, began: number): BarState => keep(state, (line) => line.kind !== "info" || line.at > began);

/**
 * Rule 5: the failures `withdrawal` covers go; nothing else. Persons gone from the state the page
 * shows also take the success of a placement that seats them alone, with its « Annuler »: a line
 * that names others too stays, still true for them (remove-person v2, « Focus, barre, envoi »).
 */
export const withdraw = (state: BarState, withdrawal: Withdrawal): BarState =>
  keep(state, (line) => {
    if (line.kind === "failure") return !covers(withdrawal, line);
    const seated = line.kind === "success" && line.persons;
    return !("persons" in withdrawal && seated && covers(withdrawal, { about: [], sent: line.id, persons: seated }));
  });

/**
 * Rule 6: an « Annuler » sent shows on no line any more: the success keeps its words without it,
 * and its send withdraws its failure. Its answer brings a success, or a failure with it again.
 * The line is still about the placement's leg.
 */
export const undoing = (state: BarState, undo: Undo): BarState => ({
  ...state,
  lines: state.lines.map((line) => (line.undo === undo ? { ...line, undo: undefined, leg: line.leg ?? undo.leg } : line)),
});

/**
 * Rule 5 (organizer-view v3.3.6, decision 44; event-board v4.4.4): the page applies a state
 * that no longer has the retour the one before had. Every line about the retour goes, success,
 * « Annuler », information and failures, before the answer that brings it writes its own; once,
 * as the page calls it on that change alone. A failure with an `aller` part stays, cut to it,
 * about no leg any more, and marked `cut`: an offer on both legs (the owner's decision on #267).
 */
export const retourGone = (state: BarState): BarState => ({
  ...state,
  lines: state.lines.flatMap((line): Line[] => {
    if ((line.leg ?? line.undo?.leg) !== "retour") return [line];
    return line.kind === "failure" && line.aller ? [{ ...line, ...line.aller, leg: undefined, aller: undefined, cut: true }] : [];
  }),
});

/**
 * The page applies a state that has the retour the one before had not (#271, M4): the information
 * that said the retour was gone goes, its aim reached (decision 45). A failure `noRetour` or
 * `noRetourAgain` stays, the owner's decision on #271: only a send about its subject, or
 * « Fermer », takes it away (rule 5).
 */
export const retourBack = (state: BarState): BarState => keep(state, (line) => !(line.kind === "info" && line.saysRetourGone));

/** Rule 7: « Fermer », or Escape, removes every line. */
export const close = (state: BarState): BarState => keep(state, () => false);

const rank = { failure: 0, info: 1, success: 2 };

/** Rule 1: the failures, most recent first, then the information, then the success. */
export const lines = (state: BarState): Line[] => [...state.lines].sort((a, b) => rank[a.kind] - rank[b.kind] || b.id - a.id);

const alertLine = (state: BarState) => state.lines.find((line) => line.id === state.alert);

/**
 * The line the region `alert` says, or waits to say, is the same in `after` as in `before`, cut
 * since to its aller part (`retourGone`): which is not writing it (event-board v4.4.6). Its marker
 * says so, not its words: words changed in place any other way are new words to say (#385).
 */
export function cutSince(before: BarState, after: BarState): boolean {
  const was = alertLine(before);
  const is = alertLine(after);
  return was?.kind === "failure" && !was.cut && is?.kind === "failure" && is.id === was.id && !!is.cut;
}

/** What each live region says: the last line written there, while it is in the bar. */
export function regions(state: BarState): { alert: string; status: string } {
  const text = (id: number | undefined) => state.lines.find((line) => line.id === id)?.text ?? "";
  return { alert: text(state.alert), status: text(state.status) };
}
