import { describe, expect, it } from "vitest";
import {
  close,
  covers,
  cutSince,
  emptyBar,
  ended,
  fail,
  inform,
  lines,
  madeUntrue,
  offerChanges,
  personLeg,
  regions,
  retourBack,
  retourGone,
  succeed,
  undoing,
  withdraw,
  type BarState,
  type Undo,
} from "./bar-state";

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

// organizer-view v3.3.6, decision 44; event-board v4.4.4, rule 5: the page applies a state that no
// longer has the retour the one before had (`retourGone`, once).
describe("decision 44: the retour gone, the bar's lines about it go", () => {
  const retour = { leg: "retour" as const };

  it("its success with its « Annuler », its information and its failures go; the aller's stay, its « Annuler » too", () => {
    const hugo = { run: () => {}, leg: "aller" as const };
    let state = fail(emptyBar, { ...failure("Tom · Retour", ["cell:tom:retour"]), ...retour });
    state = fail(state, { ...failure("Léa · Aller", ["cell:lea:aller"], 2), leg: "aller" });
    state = inform(state, { ...info("Aucune place libre au retour"), ...retour });
    state = succeed(state, { ...success("Tom est dans la voiture de Sophie"), undo: { run: () => {}, ...retour } });
    expect(texts(retourGone(state))).toEqual(["Léa · Aller"]);

    state = succeed(state, { ...success("Hugo est dans la voiture de Marc"), undo: hugo });
    state = inform(state, { ...info("Aucune place libre à l’aller"), leg: "aller" });
    expect(lines(retourGone(state)).map((line) => [line.text, line.undo === hugo])).toEqual([
      ["Léa · Aller", false],
      ["Aucune place libre à l’aller", false],
      ["Hugo est dans la voiture de Marc", true],
    ]);
  });

  // The owner's decision on #267 (review of #371): an offer on both legs keeps its aller part.
  it("a failure with an aller part stays, cut to it: its words, its subjects and its landmark, about no leg any more", () => {
    const both = ["offer:aller:claire", "offer:retour:claire"];
    const offerAller = () => true;
    const aller = { text: "La voiture de Claire pour l’aller…", about: ["offer:aller:claire"], landmark: offerAller };
    let state = fail(emptyBar, { ...failure("Les voitures de Claire pour l’aller et le retour…", both), ...retour, aller });
    state = retourGone(state);
    expect(texts(state)).toEqual(["La voiture de Claire pour l’aller…"]);
    expect(lines(state)[0].landmark).toBe(offerAller);
    expect(regions(state).alert).toBe("La voiture de Claire pour l’aller…");
    expect(texts(retourGone(state))).toEqual(["La voiture de Claire pour l’aller…"]);
    expect(lines(withdraw(state, { about: ["offer:aller:claire"] }))).toEqual([]);
  });

  it("a success whose « Annuler » is on its way is still about its leg (M7.10)", () => {
    const tom = { run: () => {}, ...retour };
    const state = undoing(succeed(emptyBar, { ...success("Tom est dans la voiture de Sophie"), undo: tom }), tom);
    expect(texts(retourGone(state))).toEqual([]);
  });

  it("a line about no leg stays: what says that the retour is gone, or a person's change", () => {
    let state = fail(emptyBar, failure("Tom · Retour : « Je cherche une place »… Il n’y a plus de retour", ["cell:tom:retour"]));
    state = inform(state, info("Il n’y a plus de retour pour cet événement."));
    expect(texts(retourGone(state))).toEqual(["Tom · Retour : « Je cherche une place »… Il n’y a plus de retour", "Il n’y a plus de retour pour cet événement."]);
  });

  it("a region that said a line gone empties, the one still waiting to say it too (B1.6)", () => {
    let state = succeed(emptyBar, success("Tom est dans la voiture de Marc"));
    state = inform(state, { ...info("Aucune place libre au retour"), ...retour });
    state = fail(state, { ...failure("Hugo · Retour", ["cell:hugo:retour"]), ...retour });
    expect(regions(retourGone(state))).toEqual({ alert: "", status: "" });
  });
});

// #271, the owner's decision (review of #409): a retour added back takes away the information that
// said it was gone, whose aim is reached (decision 45). A failure `noRetour` or `noRetourAgain`
// stays: only a send about its subject, or « Fermer », takes it away (rule 5).
describe("the retour back: the information that said it was gone goes, the failures stay", () => {
  const noRetour = "Tom · Retour : « Je cherche une place »… Il n’y a plus de retour";

  it("the information goes; the failures, about no leg, and every other line stay", () => {
    let state = fail(emptyBar, failure(noRetour, ["cell:tom:retour"]));
    state = fail(state, { ...failure("Léa · Aller", ["cell:lea:aller"], 2), leg: "aller" });
    state = succeed(state, success("Hugo est dans la voiture de Marc"));
    state = inform(state, { ...info("Il n’y a plus de retour pour cet événement."), saysRetourGone: true });
    expect(texts(retourBack(state))).toEqual(["Léa · Aller", noRetour, "Hugo est dans la voiture de Marc"]);
  });

  it("an information about another thing stays", () => {
    const state = inform(emptyBar, info("Aucune place libre à l’aller"));
    expect(texts(retourBack(state))).toEqual(["Aucune place libre à l’aller"]);
  });

  it("the region that said the information empties", () => {
    const state = inform(emptyBar, { ...info("Il n’y a plus de retour pour cet événement."), saysRetourGone: true });
    expect(regions(retourBack(state))).toEqual({ alert: "", status: "" });
  });

  // The note of #371's review: about no leg, the failure is not kept for ever.
  it("a failure `noRetour` that outlived the retour back and gone again goes with a send about its subject, or « Fermer »", () => {
    const state = retourGone(retourBack(fail(emptyBar, failure(noRetour, ["cell:tom:retour"]))));
    expect(texts(state)).toEqual([noRetour]);
    expect(texts(withdraw(state, { about: ["cell:tom:retour"] }))).toEqual([]);
    expect(texts(close(state))).toEqual([]);
  });

  // #272: the organiser's change is about the event, on no leg: neither transition takes its failure.
  it("a failure of « Modifier l’événement » (`event:edit`) survives the retour gone and back", () => {
    const edit = "L’événement n’a pas été modifié. Une erreur est survenue : réessayez dans un instant.";
    const state = fail(emptyBar, failure(edit, ["event:edit"]));
    expect(texts(retourGone(state))).toEqual([edit]);
    expect(texts(retourBack(state))).toEqual([edit]);
    expect(texts(retourBack(retourGone(state)))).toEqual([edit]);
  });
});

// Event-board v4.4.6 (#385): cutting a line to its aller part is not writing it, and `retourGone`
// says so on the line it cuts. Words changed in place any other way are written as any new words.
describe("cutSince: the line of `alert` cut to its aller part", () => {
  const retour = { leg: "retour" as const };
  const aller = { text: "La voiture de Claire pour l’aller…", about: ["offer:aller:claire"], landmark };
  const offer = (state: BarState) =>
    fail(state, { ...failure("Les voitures de Claire pour l’aller et le retour…", ["offer:aller:claire", "offer:retour:claire"]), ...retour, aller });

  it("by `retourGone`, it is; once cut, the line is cut no further", () => {
    const state = offer(emptyBar);
    const cut = retourGone(state);
    expect(cutSince(state, cut)).toBe(true);
    expect(cutSince(cut, cut)).toBe(false);
    expect(cutSince(cut, retourGone(cut))).toBe(false);
  });

  it("its words rewritten in place without `retourGone`: it is not, and the region says them", () => {
    const state = offer(emptyBar);
    const rewritten = { ...state, lines: state.lines.map((line) => ({ ...line, text: "Claire n’a pas pu proposer sa voiture." })) };
    expect(regions(rewritten).alert).toBe("Claire n’a pas pu proposer sa voiture.");
    expect(cutSince(state, rewritten)).toBe(false);
  });

  it("another failure written, or the line gone, or a line of the retour with no aller part: it is not", () => {
    const state = offer(emptyBar);
    expect(cutSince(state, fail(state, failure("Hugo n’a pas pu rejoindre vos inscriptions.")))).toBe(false);
    expect(cutSince(state, withdraw(state, { about: ["offer:aller:claire", "offer:retour:claire"] }))).toBe(false);
    expect(cutSince(emptyBar, state)).toBe(false);
    const hugo = fail(emptyBar, { ...failure("Hugo · Retour", ["cell:hugo:retour"]), ...retour });
    expect(cutSince(hugo, retourGone(hugo))).toBe(false);
  });

  it("written and cut since the region last changed: a new line, which the region says in its cut words", () => {
    const hugo = fail(emptyBar, failure("Hugo n’a pas pu rejoindre vos inscriptions."));
    const cut = retourGone(offer(hugo));
    expect(regions(cut).alert).toBe("La voiture de Claire pour l’aller…");
    expect(cutSince(hugo, cut)).toBe(false);
  });

  it("the line cut while another failure is said: `alert` still says the other, and is not cut", () => {
    const state = fail(offer(emptyBar), failure("Hugo n’a pas pu rejoindre vos inscriptions.", ["hugo"], 2));
    const cut = retourGone(state);
    expect(regions(cut).alert).toBe("Hugo n’a pas pu rejoindre vos inscriptions.");
    expect(cutSince(state, cut)).toBe(false);
  });
});

// Rule 2, v4.4.5 (#359): a placement's success held under a sheet, made untrue by a send made since.
describe("madeUntrue", () => {
  const tom = personLeg("tom", "aller");
  const lea = personLeg("lea", "aller");
  const held = { persons: [tom, lea], sent: 2 };

  it("a send made after it, which succeeded in changing one of its persons on its leg: the whole success goes (v4.4.5-1, -4)", () => {
    expect(madeUntrue(held, [{ persons: [tom], sent: 3 }])).toBe(true);
    expect(madeUntrue(held, [{ persons: [personLeg("hugo", "aller"), lea], sent: 5 }])).toBe(true);
  });

  it("another person, or the other leg: it stays true (v4.4.5-2)", () => {
    expect(madeUntrue(held, [{ persons: [personLeg("hugo", "aller")], sent: 3 }])).toBe(false);
    expect(madeUntrue(held, [{ persons: [personLeg("tom", "retour"), personLeg("lea", "retour")], sent: 3 }])).toBe(false);
  });

  it("a send made before it, or itself, does not make it untrue", () => {
    expect(madeUntrue(held, [{ persons: [tom], sent: 1 }, held])).toBe(false);
    expect(madeUntrue(held, [])).toBe(false);
  });
});

// Rule 2, v4.4.5, item 1: what « Proposer une voiture » changes once it succeeds.
describe("offerChanges", () => {
  const device = { kind: "device", personId: "marc" } as const;
  const offer = { driver: device, newPersonId: "drawn", passengerIds: ["tom", "lea"], leg: "aller" } as const;

  it("who drives, the device's or a new person, and who boards, on the car's leg", () => {
    expect(offerChanges(offer)).toEqual(["marc:aller", "tom:aller", "lea:aller"]);
    expect(offerChanges({ ...offer, driver: { kind: "new" }, passengerIds: [], leg: "retour" })).toEqual(["drawn:retour"]);
  });

  it("who drives on the other leg too, when the offer sets it: drive, without a car, not concerned", () => {
    for (const kind of ["drive", "withoutCar", "notConcerned"] as const) {
      expect(offerChanges({ ...offer, passengerIds: [], otherLeg: { kind } })).toEqual(["marc:aller", "marc:retour"]);
      expect(offerChanges({ ...offer, driver: { kind: "new" }, passengerIds: [], leg: "retour", otherLeg: { kind } })).toEqual(["drawn:retour", "drawn:aller"]);
    }
  });

  it("« Je reste dans la voiture de… », or her state there unchanged (`keep`), or no other leg: nothing there", () => {
    expect(offerChanges({ ...offer, passengerIds: [], otherLeg: { kind: "keep" } })).toEqual(["marc:aller"]);
    expect(offerChanges({ ...offer, passengerIds: [] })).toEqual(["marc:aller"]);
  });
});

// remove-person v2 (« Focus, barre, envoi », RP7.3): the page applies a state that no longer has
// one of the device's persons. Every line whose subject is she alone goes; one that names others stays.
describe("a person gone from the state the page shows", () => {
  const gone = { persons: ["lea"] };

  it("the failures about her alone go: « Modifier », a cell's choice, a removal, an offer she drives", () => {
    for (const about of [
      ["person:lea", "person:lea:firstName", "person:lea:phone"],
      ["cell:lea:aller"],
      ["removePerson:lea"],
      ["offer:aller:lea", "offer:retour:lea"],
    ]) {
      expect(covers(gone, { about, sent: 1 }), about.join()).toBe(true);
    }
  });

  it("the failures about someone else, a car, a new person, or her with others stay", () => {
    for (const about of [
      ["person:tom"],
      ["cell:tom:retour"],
      ["removePerson:tom"],
      ["seats:sophie", "seats:sophie:lea"],
      ["undo:sophie", "undo:sophie:lea"],
      ["ride:marc", "ride:marc:edit"],
      ["person:new:Léa"],
      ["offer:aller:new:Léa"],
      ["cell:lea:aller", "cell:tom:aller"],
      ["device:read"],
      ["event:edit"],
    ]) {
      expect(covers(gone, { about, sent: 1 }), about.join()).toBe(false);
    }
  });

  it("the success of a placement that names her alone goes, with its « Annuler »; one that names others too stays", () => {
    const placed = (text: string, persons: string[]) => ({ ...success(text), persons, undo: { run: () => {} } });
    expect(texts(withdraw(succeed(emptyBar, placed("Léa est dans la voiture de Sophie", ["lea"])), gone))).toEqual([]);
    const both = succeed(emptyBar, placed("Léa et Tom sont dans la voiture de Sophie", ["lea", "tom"]));
    expect(texts(withdraw(both, gone))).toEqual(["Léa et Tom sont dans la voiture de Sophie"]);
  });

  it("the other lines stay: another failure, a success that names nobody, the information", () => {
    let state = fail(emptyBar, failure("Léa", ["person:lea", "person:lea:phone"], 1));
    state = fail(state, failure("Tom", ["cell:tom:aller"], 2));
    state = inform(state, info("Léa ne fait pas le retour"));
    state = succeed(state, success("Marc ne fait plus partie de l’événement"));
    expect(texts(withdraw(state, gone))).toEqual(["Tom", "Léa ne fait pas le retour", "Marc ne fait plus partie de l’événement"]);
    expect(texts(withdraw(state, { persons: ["lea", "tom"] }))).toEqual(["Léa ne fait pas le retour", "Marc ne fait plus partie de l’événement"]);
  });

  it("the region that said a line gone empties", () => {
    const state = fail(emptyBar, failure("Léa fait toujours partie de l’événement.", ["removePerson:lea"], 1));
    expect(regions(state).alert).toBe("Léa fait toujours partie de l’événement.");
    expect(regions(withdraw(state, gone)).alert).toBe("");
  });
});
