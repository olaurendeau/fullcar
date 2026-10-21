import { describe, expect, it } from "vitest";
import { close, covers, emptyBar, ended, fail, inform, lines, regions, succeed, undoing, withdraw, type BarState, type Undo } from "./bar-state";

// The rules of « La barre de messages » (docs/design/event-board/README.md, v4.2.3, #216).

const landmark = () => true;
const success = (text: string) => ({ text, landmark });
const failure = (text: string, about: string[] = [text], sent = 1) => ({ text, landmark, about, sent });
/** An information, written at `at` on the clock that also stamps when each action begins. */
const info = (text: string, at = 1) => ({ text, landmark, at });
const texts = (state: BarState) => lines(state).map((line) => line.text);

describe("the bar's lines", () => {
  it("rule 1: the failures, most recent first, then the information, then the success, whatever order they came in", () => {
    let state = succeed(emptyBar, success("Hugo est dans la voiture de Marc"));
    state = fail(state, failure("A"));
    state = inform(state, info("Aucune place libre"));
    state = fail(state, failure("B"));
    state = fail(state, failure("C"));
    // An information written after the last failure removes nothing, and is shown under them.
    state = inform(state, info("Aucune place libre au retour"));
    expect(texts(state)).toEqual(["C", "B", "A", "Aucune place libre au retour", "Hugo est dans la voiture de Marc"]);
  });

  it("rule 2: a success replaces the success, never a failure; one without words removes it", () => {
    let state = fail(emptyBar, failure("A"));
    state = succeed(state, success("Tom est dans la voiture de Sophie"));
    state = succeed(state, success("Hugo est dans la voiture de Marc"));
    expect(texts(state)).toEqual(["A", "Hugo est dans la voiture de Marc"]);
    expect(texts(succeed(state, null))).toEqual(["A"]);
  });

  it("rule 3: a failure removes neither the success nor the other failures", () => {
    let state = succeed(emptyBar, success("Tom est dans la voiture de Sophie"));
    state = fail(state, failure("A"));
    expect(texts(fail(state, failure("B")))).toEqual(["B", "A", "Tom est dans la voiture de Sophie"]);
  });

  // The information goes with the end of an action, not with its words: the success or the failure of an action
  // that began after it comes once that action has ended (rules 2 and 3), and those of one that began before leave it.
  it("rule 4: an information replaces the last one, and goes once an action that began after it ends, whatever its outcome", () => {
    let state = succeed(emptyBar, success("Tom est dans la voiture de Sophie"));
    state = fail(state, failure("A"));
    state = inform(state, info("Aucune place libre à l’aller", 2));
    state = inform(state, info("Aucune place libre au retour", 4));
    expect(texts(state)).toEqual(["A", "Aucune place libre au retour", "Tom est dans la voiture de Sophie"]);
    expect(texts(ended(state, 5))).toEqual(["A", "Tom est dans la voiture de Sophie"]);
  });

  it("rule 4: an action that began before the information leaves it, whatever came of it (#339)", () => {
    let state = inform(emptyBar, info("Aucune place libre au retour", 4));
    state = ended(state, 3);
    state = succeed(state, success("Tom est dans la voiture de Sophie"));
    state = fail(state, failure("A"));
    expect(texts(state)).toEqual(["A", "Aucune place libre au retour", "Tom est dans la voiture de Sophie"]);
    expect(regions(state).status).toBe("Tom est dans la voiture de Sophie");
  });

  it("rule 7: « Fermer » removes every line", () => {
    let state = succeed(emptyBar, success("Tom est dans la voiture de Sophie"));
    state = inform(fail(state, failure("A")), info("Aucune place libre"));
    expect(lines(close(state))).toEqual([]);
    expect(regions(close(state))).toEqual({ alert: "", status: "" });
  });
});

describe("rule 5: what withdraws a failure", () => {
  const seats = ["seats:sophie", "seats:sophie:tom", "seats:sophie:lea"];

  it("a send that carries all its subject and fields, not one that carries part of them", () => {
    const failed = { about: seats, sent: 1 };
    expect(covers({ about: seats }, failed)).toBe(true);
    expect(covers({ about: [...seats, "seats:sophie:hugo"] }, failed)).toBe(true);
    expect(covers({ about: ["seats:sophie", "seats:sophie:tom"] }, failed)).toBe(false);
    expect(covers({ about: ["seats:marc", "seats:marc:tom", "seats:marc:lea"] }, failed)).toBe(false);
  });

  it("a change of a car does not withdraw its removal's failure, nor its removal a change's (#213, #218)", () => {
    expect(covers({ about: ["ride:claire:edit", "ride:claire:edit:location"] }, { about: ["ride:claire"], sent: 1 })).toBe(false);
    expect(covers({ about: ["ride:claire"] }, { about: ["ride:claire:edit", "ride:claire:edit:location"], sent: 1 })).toBe(false);
  });

  it("with a send of several subjects, each failure about one of them", () => {
    const about = ["offer:aller:marc", "offer:retour:marc"];
    expect(covers({ about }, { about: ["offer:retour:marc"], sent: 1 })).toBe(true);
    expect(covers({ about: ["offer:aller:marc"] }, { about, sent: 1 })).toBe(false);
  });

  it("an answer withdraws only the failures of earlier sends: never the one of a send made since", () => {
    expect(covers({ about: seats, before: 3 }, { about: seats, sent: 2 })).toBe(true);
    expect(covers({ about: seats, before: 3 }, { about: seats, sent: 3 })).toBe(false);
    expect(covers({ about: seats, before: 3 }, { about: seats, sent: 4 })).toBe(false);
  });

  it("a car removed takes everything sent before about it, whatever fields it carried, and nothing about another car", () => {
    const gone = { gone: ["seats:sophie", "ride:sophie:edit"], before: 5 };
    expect(covers(gone, { about: seats, sent: 4 })).toBe(true);
    expect(covers(gone, { about: ["ride:sophie:edit", "ride:sophie:edit:note"], sent: 1 })).toBe(true);
    expect(covers(gone, { about: ["seats:marc", "seats:marc:tom"], sent: 4 })).toBe(false);
    expect(covers(gone, { about: seats, sent: 5 })).toBe(false);
  });

  it("withdraws the failures covered alone: the others, the success and the information stay", () => {
    let state = succeed(emptyBar, success("Hugo est dans la voiture de Marc"));
    state = fail(state, failure("A", seats, 1));
    state = fail(state, failure("B", ["cell:tom:aller"], 2));
    state = inform(state, info("Aucune place libre"));
    expect(texts(withdraw(state, { about: seats }))).toEqual(["B", "Aucune place libre", "Hugo est dans la voiture de Marc"]);
  });
});

describe("the regions: each says the last line written there while it is in the bar", () => {
  it("a failure is said in `alert` alone, a success or an information in `status` alone", () => {
    let state = succeed(emptyBar, success("Tom est dans la voiture de Sophie"));
    expect(regions(state)).toEqual({ alert: "", status: "Tom est dans la voiture de Sophie" });
    state = fail(state, failure("A"));
    expect(regions(state)).toEqual({ alert: "A", status: "Tom est dans la voiture de Sophie" });
    state = fail(state, failure("B", ["b"]));
    state = inform(state, info("Aucune place libre"));
    expect(regions(state)).toEqual({ alert: "B", status: "Aucune place libre" });
  });

  it("a region empties when its line goes, even when an older line of its kind stays", () => {
    let state = succeed(emptyBar, success("Tom est dans la voiture de Sophie"));
    state = fail(fail(state, failure("A", ["a"])), failure("B", ["b"]));
    state = inform(state, info("Aucune place libre"));
    expect(regions(withdraw(ended(state, 2), { about: ["b"] }))).toEqual({ alert: "", status: "" });
    expect(texts(withdraw(ended(state, 2), { about: ["b"] }))).toEqual(["A", "Tom est dans la voiture de Sophie"]);
  });
});

describe("rule 6: one « Annuler » per placement", () => {
  const undoOf = (state: BarState) => lines(state).map((line) => (line.undo ? `${line.text} + Annuler` : line.text));
  const placed = (undo: Undo) => ({ ...success("Tom est dans la voiture de Sophie"), undo });
  const undoFailed = (undo: Undo) => ({ ...failure("Tom n’a pas pu sortir", ["undo:sophie", "undo:sophie:tom"]), undo });

  it("is on the success of the placement, and goes with it at the next success", () => {
    const state = succeed(emptyBar, placed({ run: () => {} }));
    expect(undoOf(state)).toEqual(["Tom est dans la voiture de Sophie + Annuler"]);
    expect(undoOf(fail(state, failure("A")))).toEqual(["A", "Tom est dans la voiture de Sophie + Annuler"]);
    expect(undoOf(succeed(state, success("Hugo est dans la voiture de Marc")))).toEqual(["Hugo est dans la voiture de Marc"]);
  });

  it("sent, it shows on no line: the success stays without it, a failure of another placement keeps its own", () => {
    const tom = { run: () => {} };
    const hugo = { run: () => {} };
    let state = fail(emptyBar, { ...undoFailed(hugo), text: "Hugo n’a pas pu sortir" });
    state = succeed(state, placed(tom));
    expect(undoOf(undoing(state, tom))).toEqual(["Hugo n’a pas pu sortir + Annuler", "Tom est dans la voiture de Sophie"]);
  });

  it("failed, its failure carries it alone; a later success leaves the failure and its « Annuler »", () => {
    const tom = { run: () => {} };
    let state = undoing(succeed(emptyBar, placed(tom)), tom);
    state = fail(state, undoFailed(tom));
    expect(undoOf(state)).toEqual(["Tom n’a pas pu sortir + Annuler", "Tom est dans la voiture de Sophie"]);
    state = succeed(state, success("Hugo est dans la voiture de Marc"));
    expect(undoOf(state)).toEqual(["Tom n’a pas pu sortir + Annuler", "Hugo est dans la voiture de Marc"]);
    // Sent again from the failure: its send withdraws it, and no line shows « Annuler ».
    state = withdraw(undoing(state, tom), { about: ["undo:sophie", "undo:sophie:tom"] });
    expect(undoOf(state)).toEqual(["Hugo est dans la voiture de Marc"]);
  });
});
