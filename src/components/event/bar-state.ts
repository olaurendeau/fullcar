/*
 * What the message bar shows (« La barre de messages », docs/design/event-board/README.md,
 * v4.2.3, #216): the last success, the last information and every failure still waiting. The
 * only place that decides it: pure functions over a state that `useMessageBar` keeps.
 */

/**
 * « Annuler » of a placement (rule 6): what it sends. One per placement: the success's and the
 * failure of its undo carry the same.
 */
export interface Undo {
  run: () => void;
}

/** A message: its words, its landmark, which takes the focus and says whether it is shown (rule 8), and its « Annuler ». */
export interface Message {
  text: string;
  landmark: () => boolean;
  undo?: Undo;
}

/** What a send was about: its subjects, each subject's fields after it (#208), and its number. */
export interface Sent {
  about: readonly string[];
  sent: number;
}

/** A failure, with what its send was about, and whether nothing left for want of a connection. */
export interface Failure extends Message, Sent {
  offline?: boolean;
}

/** An information, and when it was written, on the clock that also stamps when each action begins (`ended`). */
export interface Information extends Message {
  at: number;
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
 * about its subjects (`gone`), whatever fields they carried, sent before its removal.
 */
export type Withdrawal = { about: readonly string[]; before?: number } | { gone: readonly string[]; before: number };

export function covers(withdrawal: Withdrawal, { about, sent }: Sent): boolean {
  if (withdrawal.before !== undefined && sent >= withdrawal.before) return false;
  if ("gone" in withdrawal) return withdrawal.gone.includes(about[0]);
  return about.every((subject) => withdrawal.about.includes(subject));
}

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

/** Rule 5: the failures `withdrawal` covers go; nothing else. */
export const withdraw = (state: BarState, withdrawal: Withdrawal): BarState =>
  keep(state, (line) => line.kind !== "failure" || !covers(withdrawal, line));

/**
 * Rule 6: an « Annuler » sent shows on no line any more: the success keeps its words without it,
 * and its send withdraws its failure. Its answer brings a success, or a failure with it again.
 */
export const undoing = (state: BarState, undo: Undo): BarState => ({
  ...state,
  lines: state.lines.map((line) => (line.undo === undo ? { ...line, undo: undefined } : line)),
});

/** Rule 7: « Fermer », or Escape, removes every line. */
export const close = (state: BarState): BarState => keep(state, () => false);

const rank = { failure: 0, info: 1, success: 2 };

/** Rule 1: the failures, most recent first, then the information, then the success. */
export const lines = (state: BarState): Line[] => [...state.lines].sort((a, b) => rank[a.kind] - rank[b.kind] || b.id - a.id);

/** What each live region says: the last line written there, while it is in the bar. */
export function regions(state: BarState): { alert: string; status: string } {
  const text = (id: number | undefined) => state.lines.find((line) => line.id === id)?.text ?? "";
  return { alert: text(state.alert), status: text(state.status) };
}
