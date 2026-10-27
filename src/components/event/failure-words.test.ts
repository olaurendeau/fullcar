import { readFileSync } from "node:fs";
import { createFormatter, createTranslator, type Messages } from "next-intl";
import { describe, expect, it } from "vitest";
import type { DeviceState } from "@/domain/board";
import { cellActions, type CellAction } from "@/domain/device-matrix";
import type { Leg } from "@/domain/leg";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import {
  cellNotDone,
  cellWhy,
  editedFields,
  failureText,
  nameList,
  noRetourAgain,
  noRetourInfo,
  noRetourWhy,
  offerWhy,
  personGone,
  personWhy,
  removalProblem,
  undoWhy,
  undoneText,
  whyOf,
  wordsOf,
  type NotDone,
  type Why,
} from "./failure-words";

// C11.11: every failure in the bar, word for word as « Chaque échec, mot pour mot » says it
// (docs/design/event-board/README.md, v4.2), in French and in English.

const LOCALES = { fr, en } as const;
type Locale = keyof typeof LOCALES;

const words = (locale: Locale) =>
  wordsOf(createTranslator<Messages>({ locale, messages: LOCALES[locale] }), createFormatter({ locale }));

/** What a row's action sends, and what its refusals need to name. */
interface Action {
  notDone: NotDone;
  /** The persons sent, whom `alreadyInCar` names after a tap or the sheet. */
  names?: string[];
  /** The passengers ticked in « Qui monte avec vous ? », whom `alreadyInCar` names after an offer. */
  passengers?: string[];
  drives?: { firstName: string; leg: Leg };
  /** « Annuler »: offline or failing, the reason names the button. */
  undo?: boolean;
}

const seats = (names: string[], driver: string): Action => ({ notDone: { kind: "seats", names, driver }, names });

/** Each action of the table, by its first column. */
const ACTIONS: Record<string, Action> = {
  "Un tap sur une place : Tom, voiture de Sophie": seats(["Tom"], "Sophie"),
  "La feuille, plusieurs personnes : Tom et Léa, voiture de Sophie": seats(["Tom", "Léa"], "Sophie"),
  "Première inscription depuis une place, inscription faite, place refusée : Inès, voiture de Marc": seats(["Inès"], "Marc"),
  "« Annuler » : Tom et Léa, voiture de Sophie": { notDone: { kind: "leave", names: ["Tom", "Léa"], driver: "Sophie" }, undo: true },
  "Cellule, « Ne fait pas l’aller » : Tom · Aller": {
    notDone: { kind: "choice", firstName: "Tom", leg: "aller", choice: "notConcerned" },
    drives: { firstName: "Tom", leg: "aller" },
  },
  "Cellule, « Je cherche une place » : Tom · Retour": {
    notDone: { kind: "choice", firstName: "Tom", leg: "retour", choice: "lookingForSeat" },
    drives: { firstName: "Tom", leg: "retour" },
  },
  "Cellule, « Sortir de la voiture » : Léa, voiture de Claire": {
    notDone: { kind: "leave", names: ["Léa"], driver: "Claire" },
    drives: { firstName: "Léa", leg: "aller" },
  },
  "« Ajouter une personne » : Inès": { notDone: { kind: "addPerson", firstName: "Inès" } },
  "« Modifier » une personne, prénom et téléphone : Tom (prénom affiché avant le changement)": {
    notDone: { kind: "editPerson", firstName: "Tom", fields: "both" },
  },
  "« Modifier » une personne, le téléphone seul : Tom": { notDone: { kind: "editPerson", firstName: "Tom", fields: "phone" } },
  "« Proposer une voiture », ce leg seulement : Marc, aller": {
    notDone: { kind: "offerRide", driver: "Marc", legs: "aller" },
    passengers: ["Inès", "Hugo"],
  },
  "« Proposer une voiture » avec « Je ramène aussi des personnes » : Claire": {
    notDone: { kind: "offerRide", driver: "Claire", legs: "both" },
    passengers: ["Léa"],
  },
  "« Réessayer » de « Vos inscriptions »": { notDone: { kind: "readDevice" } },
  "« Retirer la voiture » : Claire, aller": { notDone: { kind: "removeRide", driver: "Claire", leg: "aller" } },
  "« Modifier » la voiture (#93) : Claire, aller": { notDone: { kind: "editRide", driver: "Claire", leg: "aller" } },
  "« Proposer une voiture » : Claire, personne de l’appareil, son numéro vidé ailleurs (v4.8)": {
    notDone: { kind: "offerRide", driver: "Claire", legs: "aller" },
  },
  "« Modifier » une personne, le téléphone seul, vidé : Claire, qui conduit (v4.8)": {
    notDone: { kind: "editPerson", firstName: "Claire", fields: "phone" },
  },
};

/** What the page knows of a failure, `source` (offline, a 500, a refusal's key), turned into its reason as the sender does. */
function whyFor(source: string, action: Action): Why {
  if (source === "alreadyInCar") {
    return action.passengers ? { kind: "passengerInCar", names: action.passengers } : { kind: "alreadyInCar", names: action.names! };
  }
  // The table's example: one seat left.
  if (source === "notEnoughSeats") return { kind: "notEnoughSeats", free: 1 };
  if (source === "drives") return { kind: "drives", ...action.drives! };
  if (source === "alreadyDriving" && action.notDone.kind === "offerRide") return { kind: "alreadyDriving", driver: action.notDone.driver };
  if (source === "phoneWhileDriving" && action.notDone.kind === "editPerson") return personWhy("phoneWhileDriving", action.notDone.firstName);
  if (action.undo) return undoWhy(source as Parameters<typeof undoWhy>[0]);
  return whyOf(source as Parameters<typeof whyOf>[0]);
}

/** The failures of a row's second column: offline; a server error, a network one, and each refusal given the same words; a refusal. */
function sources(failure: string): string[] {
  const keys = [...failure.matchAll(/`(\w+)/g)].map((match) => match[1]);
  if (failure === "hors ligne") return ["offline"];
  if (failure.startsWith("erreur serveur")) return ["failed", ...keys];
  return keys.slice(0, 1);
}

/** The rows of « Chaque échec, mot pour mot »: action, failure, French text, English text. */
function rows() {
  const readme = readFileSync(new URL("../../../docs/design/event-board/README.md", import.meta.url), "utf8").split("\n");
  const start = readme.indexOf("### Chaque échec, mot pour mot (v4.2)");
  const end = readme.findIndex((line, index) => index > start && line.startsWith("### "));
  return readme
    .slice(start, end)
    .filter((line) => line.startsWith("| ") && !line.startsWith("| action") && !line.startsWith("|---"))
    .map((line) => {
      const [action, failure, fr, en] = line.slice(2, -2).split(" | ");
      return { action, failure, fr, en };
    });
}

describe("failureText: each failure, word for word (C11.11)", () => {
  const table = rows();

  it("reads every row, and knows every action of the table", () => {
    // The exact count, so a row dropped from the README fails here (#785): update it with each copy of the design.
    expect(table.length).toBe(70);
    expect(new Set(table.map((row) => row.action))).toEqual(new Set(Object.keys(ACTIONS)));
    // A failure column of a form `sources` does not know would give no test at all.
    for (const row of table) expect(sources(row.failure), `${row.action}, ${row.failure}`).not.toHaveLength(0);
  });

  for (const row of table) {
    for (const source of sources(row.failure)) {
      it(`${row.action}, ${source}`, () => {
        const action = ACTIONS[row.action];
        const why = whyFor(source, action);
        expect(failureText(words("fr"), action.notDone, why)).toBe(row.fr);
        expect(failureText(words("en"), action.notDone, why)).toBe(row.en);
      });
    }
  }
});

/** A cell's rows, by its sheet as it was at the send: the action touched, the person, the leg and her state there (#224). */
const CELLS: Record<string, { action: Exclude<CellAction, "seeCar">; firstName: string; leg: Leg; state: DeviceState }> = {
  "Cellule, « Ne fait pas l’aller » : Tom · Aller": { action: "notConcerned", firstName: "Tom", leg: "aller", state: { kind: "withoutCar" } },
  "Cellule, « Je cherche une place » : Tom · Retour": { action: "lookingForSeat", firstName: "Tom", leg: "retour", state: { kind: "notConcerned" } },
  "Cellule, « Sortir de la voiture » : Léa, voiture de Claire": {
    action: "leaveCar",
    firstName: "Léa",
    leg: "aller",
    state: { kind: "passenger", rideId: "claire", driver: { id: "claire", firstName: "Claire" } },
  },
};

describe("cellNotDone and cellWhy: a cell's failure names the person, the leg and the choice (C11.11)", () => {
  const cells = rows().filter((row) => row.action in CELLS);

  it("reads the rows of the three actions of a cell", () => {
    expect(new Set(cells.map((row) => row.action))).toEqual(new Set(Object.keys(CELLS)));
  });

  for (const row of cells) {
    for (const source of sources(row.failure)) {
      it(`${row.action}, ${source}`, () => {
        const { action, ...cell } = CELLS[row.action];
        const why = cellWhy(source as Parameters<typeof cellWhy>[0], cell);
        expect(failureText(words("fr"), cellNotDone(action, cell), why)).toBe(row.fr);
        expect(failureText(words("en"), cellNotDone(action, cell), why)).toBe(row.en);
      });
    }
  }

  it("« Ne fait pas l’aller » from a passenger names the choice, not the car", () => {
    const { state } = CELLS["Cellule, « Sortir de la voiture » : Léa, voiture de Claire"];
    expect(cellNotDone("notConcerned", { firstName: "Léa", leg: "aller", state })).toEqual({
      kind: "choice",
      firstName: "Léa",
      leg: "aller",
      choice: "notConcerned",
    });
  });

  // cellNotDone names the car for « Sortir de la voiture »: only a passenger has one to leave (#290's review).
  it("« Sortir de la voiture » is offered to a passenger alone", () => {
    // One of each kind: a new kind of state does not compile until it is here.
    const states = {
      withoutCar: { kind: "withoutCar" },
      notConcerned: { kind: "notConcerned" },
      driver: { kind: "driver", rideId: "tom" },
      passenger: { kind: "passenger", rideId: "claire", driver: { id: "claire", firstName: "Claire" } },
    } satisfies { [K in DeviceState["kind"]]: Extract<DeviceState, { kind: K }> };
    const offered = Object.values(states).filter((state) => cellActions(state).includes("leaveCar"));
    expect(offered.map((state) => state.kind)).toEqual(["passenger"]);
  });

  // v4.8, rule 8: only a change of her number meets it; a cell's action gets the generic reason.
  it("gives `phoneWhileDriving` the generic reason", () => {
    const { state } = CELLS["Cellule, « Sortir de la voiture » : Léa, voiture de Claire"];
    expect(cellWhy("phoneWhileDriving", { firstName: "Léa", leg: "aller", state })).toEqual(whyOf("invalid"));
  });
});

// #225: « Modifier » names the fields it sent; a refusal of a person's form says its reason.
describe("editedFields and personWhy: a person's form (C11.11)", () => {
  it("names the one field sent, or both", () => {
    expect(editedFields(["firstName"])).toBe("firstName");
    expect(editedFields(["phone"])).toBe("phone");
    expect(editedFields(["firstName", "phone"])).toBe("both");
  });

  it("throws with nothing changed: nothing is sent then (v4.4, #298)", () => {
    expect(() => editedFields([])).toThrow();
  });

  it("gives `drives`, which only a cell's action meets, the generic reason, and the others as `whyOf` does", () => {
    expect(personWhy("drives", "Tom")).toEqual({ kind: "failed" });
    for (const error of ["forbidden", "eventNotFound", "invalid", "idTaken", "noRetour", "offline", "failed"] as const) {
      expect(personWhy(error, "Tom")).toEqual(whyOf(error));
    }
  });

  // v4.8, rule 8: emptying the number of who drives is refused, and the reason names her.
  it("gives `phoneWhileDriving` the person who drives", () => {
    expect(personWhy("phoneWhileDriving", "Claire")).toEqual({ kind: "phoneWhileDriving", firstName: "Claire" });
  });

  it("« Modifier » of the first name alone, word for word", () => {
    const notDone: NotDone = { kind: "editPerson", firstName: "Tom", fields: editedFields(["firstName"]) };
    expect(failureText(words("fr"), notDone, personWhy("offline", "Tom"))).toBe("Le prénom de Tom n’a pas été enregistré. Vérifiez la connexion, puis réessayez.");
    expect(failureText(words("en"), notDone, personWhy("offline", "Tom"))).toBe("Tom’s first name was not saved. Check your connection, then try again.");
  });
});

// #226: an offer's refusal says its reason, `alreadyDriving` naming who drives.
describe("offerWhy: « Proposer une voiture » (C11.11)", () => {
  const offers = rows().filter((row) => row.action.startsWith("« Proposer une voiture »"));

  it("reads the rows of an offer on one leg, on both, and refused for want of a number (v4.8)", () => {
    expect(new Set(offers.map((row) => row.action)).size).toBe(3);
  });

  for (const row of offers) {
    // `alreadyInCar` names the passengers ticked in « Qui monte avec vous ? » (#171).
    for (const source of sources(row.failure)) {
      it(`${row.action}, ${source}`, () => {
        const { notDone, passengers = [] } = ACTIONS[row.action];
        if (notDone.kind !== "offerRide") throw new Error(row.action);
        const why = offerWhy(source as Parameters<typeof offerWhy>[0], notDone.driver, passengers);
        expect(failureText(words("fr"), notDone, why)).toBe(row.fr);
        expect(failureText(words("en"), notDone, why)).toBe(row.en);
      });
    }
  }

  it("gives `alreadyInCar`, with no passenger ticked to name, the generic reason", () => {
    expect(offerWhy("alreadyInCar", "Marc", [])).toEqual({ kind: "failed" });
  });
});

const FIVE = ["Tom", "Léa", "Hugo", "Nina", "Zoé"];

// « Plusieurs prénoms »: up to three, `format.list`; beyond, the first two and « et N autres ». In
// English, `format.list` puts a comma before « and » (Intl.ListFormat, `en`).
const LISTS: Record<Locale, string[]> = {
  fr: ["Tom", "Tom et Léa", "Tom, Léa et Hugo", "Tom, Léa et 2 autres", "Tom, Léa et 3 autres"],
  en: ["Tom", "Tom and Léa", "Tom, Léa, and Hugo", "Tom, Léa and 2 others", "Tom, Léa and 3 others"],
};

describe("nameList: from one to five persons (C11.11)", () => {
  for (const locale of ["fr", "en"] as const) {
    for (let count = 1; count <= 5; count++) {
      const names = FIVE.slice(0, count);
      const list = LISTS[locale][count - 1];
      const one = count === 1;

      it(`${locale}, ${count}: the list, and every sentence that names them agrees with all of them`, () => {
        expect(nameList(words(locale), names)).toBe(list);
        const say = (notDone: NotDone, why: Why) => failureText(words(locale), notDone, why);
        if (locale === "fr") {
          expect(say({ kind: "seats", names, driver: "Sophie" }, { kind: "offline" })).toBe(
            `${list} ${one ? "n’a" : "n’ont"} pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis réessayez.`,
          );
          expect(say({ kind: "leave", names, driver: "Sophie" }, { kind: "alreadyInCar", names })).toBe(
            `${list} ${one ? "n’a" : "n’ont"} pas pu sortir de la voiture de Sophie. ${one ? "Tom est" : "Une de ces personnes est"} déjà dans une voiture.`,
          );
          expect(say({ kind: "offerRide", driver: "Marc", legs: "retour" }, { kind: "passengerInCar", names })).toBe(
            `La voiture de Marc pour le retour n’a pas été proposée. ${one ? "Tom est déjà" : `Parmi ${list}, une personne au moins est déjà`} dans une voiture.`,
          );
        } else {
          expect(say({ kind: "seats", names, driver: "Sophie" }, { kind: "failed" })).toBe(
            `${list} could not be seated in Sophie’s car. Something went wrong: try again in a moment.`,
          );
          expect(say({ kind: "leave", names, driver: "Sophie" }, { kind: "alreadyInCar", names })).toBe(
            `${list} could not leave Sophie’s car. ${one ? "Tom is" : "One of these people is"} already in a car.`,
          );
          expect(say({ kind: "offerRide", driver: "Marc", legs: "retour" }, { kind: "passengerInCar", names })).toBe(
            `Marc’s car for the return trip was not offered. ${one ? "Tom is already in a car" : `Of ${list}, at least one is already in a car`}.`,
          );
        }
      });

      it(`${locale}, ${count}: the success of « Annuler » agrees with all of them, given back or already out (v4.4.4)`, () => {
        const say = (undone: string[]) => undoneText(words(locale), { names, undone, driver: "Sophie" });
        if (locale === "fr") {
          expect(say(names)).toBe(`${list} ${one ? "n’est plus" : "ne sont plus"} dans la voiture de Sophie`);
          expect(say([])).toBe(`${list} ${one ? "n’était" : "n’étaient"} déjà plus dans la voiture de Sophie`);
        } else {
          expect(say(names)).toBe(`${list} ${one ? "is" : "are"} no longer in Sophie’s car`);
          expect(say([])).toBe(`${list} ${one ? "was" : "were"} already out of Sophie’s car`);
        }
      });
    }
  }
});

// « Un « Annuler » renvoyé depuis une ligne d’échec » (v4.4.4): the success names those given
// back, `Seat.undone`; nobody given back, every person of the « Annuler », `Seat.alreadyOut`.
describe("undoneText: the success of « Annuler » (C5.10, B1.1 to B1.3)", () => {
  const say = (locale: Locale, undone: string[]) => undoneText(words(locale), { names: ["Tom", "Léa"], undone, driver: "Sophie" });

  it("names all, a part, or, nobody given back, all of them already out", () => {
    expect(say("fr", ["Tom", "Léa"])).toBe("Tom et Léa ne sont plus dans la voiture de Sophie");
    expect(say("fr", ["Tom"])).toBe("Tom n’est plus dans la voiture de Sophie");
    expect(say("fr", [])).toBe("Tom et Léa n’étaient déjà plus dans la voiture de Sophie");
    expect(say("en", [])).toBe("Tom and Léa were already out of Sophie’s car");
    expect(undoneText(words("fr"), { names: FIVE.slice(0, 4), undone: [], driver: "Sophie" })).toBe("Tom, Léa et 2 autres n’étaient déjà plus dans la voiture de Sophie");
  });
});

describe("undoWhy: « Annuler » (C5.10, C11.11)", () => {
  it("names the button offline and on an error, `invalid` included; keeps a refusal's reason, as `whyOf` gives it", () => {
    expect(undoWhy("offline")).toEqual({ kind: "retryUndo", problem: "offline" });
    for (const error of ["failed", "invalid"] as const) expect(undoWhy(error)).toEqual({ kind: "retryUndo", problem: "failed" });
    for (const error of ["forbidden", "eventNotFound", "noRetour"] as const) expect(undoWhy(error)).toEqual(whyOf(error));
  });
});

// Decision 45 (organizer-view v3.3.6, #267): a send refused by `noRetour` whose aim holds without
// the retour says an information, word for word as « Les mots » says it; the others fail.
describe("noRetourInfo", () => {
  const cell = (state: DeviceState) => ({ firstName: "Léa", leg: "retour" as const, state });
  const passenger: DeviceState = { kind: "passenger", rideId: "claire", driver: { id: "claire", firstName: "Claire" } };

  it("« Annuler », « Sortir de la voiture » and « Retirer la voiture »: the car is no longer offered", () => {
    for (const notDone of [{ kind: "leave", names: ["Tom", "Léa"], driver: "Claire" } as const, cellNotDone("leaveCar", cell(passenger)), { kind: "removeRide", driver: "Claire", leg: "retour" } as const]) {
      expect(noRetourInfo(words("fr"), notDone)).toBe("Il n’y a plus de retour pour cet événement : la voiture de Claire n’est plus proposée.");
      expect(noRetourInfo(words("en"), notDone)).toBe("This event no longer has a return trip: Claire’s car is no longer offered.");
    }
  });

  it("« Ne fait pas le retour »: the retour is gone; « Je cherche une place » and what creates fail", () => {
    expect(noRetourInfo(words("fr"), cellNotDone("notConcerned", cell(passenger)))).toBe("Il n’y a plus de retour pour cet événement.");
    expect(noRetourInfo(words("en"), cellNotDone("notConcerned", cell({ kind: "withoutCar" })))).toBe("This event no longer has a return trip.");
    const failing: NotDone[] = [
      cellNotDone("lookingForSeat", cell({ kind: "notConcerned" })),
      { kind: "seats", names: ["Tom"], driver: "Sophie" },
      { kind: "offerRide", driver: "Marc", legs: "retour" },
      { kind: "editRide", driver: "Sophie", leg: "retour" },
      { kind: "addPerson", firstName: "Inès" },
    ];
    expect(failing.map((notDone) => noRetourInfo(words("fr"), notDone))).toEqual(failing.map(() => undefined));
  });
});

// Rule 9 and decision 47 (#265, #266): what a form's `noRetour` says, by the leg it was sent on.
describe("noRetourWhy", () => {
  const noRetour = whyOf("noRetour");

  it("sent on the retour: the sheet closes, and the bar says why", () => {
    expect(noRetourWhy(noRetour, "retour", "addPerson")).toEqual({ why: noRetour, closes: true });
  });

  it("sent from the aller: the sheet stays, and closed, the bar says to send again for the aller alone", () => {
    expect(noRetourWhy(noRetour, "aller", "addPerson")).toEqual({ why: noRetourAgain("addPerson"), closes: false });
    expect(noRetourWhy(noRetour, "aller", "offerRide")).toEqual({ why: noRetourAgain("offerRide"), closes: false });
  });

  // Review of #351: a person's change goes on no leg, and never says to add her again.
  it("sent on no leg, or another reason: as it is", () => {
    expect(noRetourWhy(noRetour, undefined, "addPerson")).toEqual({ why: noRetour, closes: false });
    expect(noRetourWhy(whyOf("offline"), "retour", "offerRide")).toEqual({ why: whyOf("offline"), closes: false });
  });
});

// RP5.4 (remove-person v2): an action on a person removed meanwhile names her, `Actions.why.personGone`.
describe("personGone: a person removed from the event meanwhile", () => {
  const readme = readFileSync(new URL("../../../docs/design/remove-person/README.md", import.meta.url), "utf8").split("\n");
  const row = readme.find((line) => line.startsWith("| `Actions.why.personGone` |"))?.split(" | ");
  const [fr, en] = [row?.[1] ?? "", row?.[2] ?? ""].map((text) => text.replace("{firstName}", "Tom"));

  it("reads its words in the design's table", () => {
    expect(fr).toBe("Tom ne fait plus partie de l’événement.");
    expect(en).toBe("Tom is no longer part of the event.");
  });

  it("names the first of those sent who is gone, as the send showed her", () => {
    const sent = [
      { id: "p1", firstName: "Léa" },
      { id: "p2", firstName: "Tom" },
      { id: "p3", firstName: "Zoé" },
    ];
    expect(personGone(sent, ["p3", "p2"])).toEqual({ kind: "personGone", firstName: "Tom" });
    // None of those sent, which only a forged answer gives: the generic reason.
    expect(personGone(sent, ["p9"])).toEqual({ kind: "failed" });
  });

  it("a cell's action, a person's form and an offer name her, word for word", () => {
    const cell = { firstName: "Tom", leg: "aller" as const, state: { kind: "withoutCar" as const } };
    const cases: [NotDone, Why][] = [
      [cellNotDone("notConcerned", cell), cellWhy("personGone", cell)],
      [{ kind: "editPerson", firstName: "Tom", fields: "firstName" }, personWhy("personGone", "Tom")],
      [{ kind: "offerRide", driver: "Tom", legs: "aller" }, personGone([{ id: "p2", firstName: "Tom" }], ["p2"])],
      [{ kind: "seats", names: ["Tom"], driver: "Claire" }, personGone([{ id: "p2", firstName: "Tom" }], ["p2"])],
    ];
    for (const [notDone, why] of cases) {
      expect(why).toEqual({ kind: "personGone", firstName: "Tom" });
      for (const [locale, text] of [["fr", fr], ["en", en]] as const) {
        expect(failureText(words(locale), notDone, why).endsWith(` ${text}`)).toBe(true);
      }
    }
    expect(failureText(words("fr"), { kind: "seats", names: ["Tom"], driver: "Claire" }, cases[3][1])).toBe(
      "Tom n’a pas pu monter dans la voiture de Claire. Tom ne fait plus partie de l’événement.",
    );
  });
});

// #588 (remove-person v2, decision 13): any write on an anonymised event, `Actions.why.eventEnded`.
describe("eventEnded: a write on an anonymised event", () => {
  const readme = readFileSync(new URL("../../../docs/design/remove-person/README.md", import.meta.url), "utf8").split("\n");
  const row = readme.find((line) => line.startsWith("| `Actions.why.eventEnded` |"))?.split(" | ");
  const [fr, en] = [row?.[1] ?? "", row?.[2] ?? ""];

  it("reads its words in the design's table", () => {
    expect(fr).toBe("Cet événement est terminé : ses inscriptions ont été effacées.");
    expect(en).toBe("This event is over: its sign-ups have been erased.");
  });

  it("says them after what was not done, whatever the write", () => {
    const cell = { firstName: "Tom", leg: "aller" as const, state: { kind: "withoutCar" as const } };
    const cases: [NotDone, Why][] = [
      [{ kind: "seats", names: ["Tom"], driver: "Claire" }, whyOf("eventEnded")],
      [cellNotDone("notConcerned", cell), cellWhy("eventEnded", cell)],
      [{ kind: "editPerson", firstName: "Tom", fields: "phone" }, personWhy("eventEnded", "Tom")],
      [{ kind: "offerRide", driver: "Tom", legs: "aller" }, offerWhy("eventEnded", "Tom", [])],
      [{ kind: "leave", names: ["Tom"], driver: "Claire" }, undoWhy("eventEnded")],
      [{ kind: "editEvent" }, whyOf("eventEnded")],
    ];
    for (const [notDone, why] of cases) {
      expect(why).toEqual({ kind: "eventEnded" });
      for (const [locale, text] of [["fr", fr], ["en", en]] as const) {
        expect(failureText(words(locale), notDone, why).endsWith(` ${text}`)).toBe(true);
      }
    }
  });
});

describe("whyOf", () => {
  it("gives `invalid` and `idTaken` the generic reason, and keeps the others", () => {
    for (const error of ["invalid", "idTaken", "failed"] as const) expect(whyOf(error)).toEqual({ kind: "failed" });
    for (const error of ["offline", "seatTaken", "rideGone", "forbidden", "eventNotFound", "passengersChanged", "noRetour", "driverWithoutPhone"] as const) {
      expect(whyOf(error)).toEqual({ kind: error });
    }
  });
});

/** What each sender gives a `noRetour` refusal, by the row of the v3.3 table it says. */
const NO_RETOUR: Record<string, () => [NotDone, Why]> = {
  "Cellule, « Je cherche une place » : Tom · Retour": () => {
    const { action, ...cell } = CELLS["Cellule, « Je cherche une place » : Tom · Retour"];
    return [cellNotDone(action, cell), cellWhy("noRetour", cell)];
  },
  "Un tap sur une place : Tom, voiture de Sophie au retour": () => [{ kind: "seats", names: ["Tom"], driver: "Sophie" }, whyOf("noRetour")],
  "La feuille « Qui monte… ? » : Tom et Léa, voiture de Sophie au retour": () => [
    { kind: "seats", names: ["Tom", "Léa"], driver: "Sophie" },
    whyOf("noRetour"),
  ],
  "« Proposer une voiture » depuis le Retour : Marc": () => [{ kind: "offerRide", driver: "Marc", legs: "retour" }, offerWhy("noRetour", "Marc", [])],
  "« Ajouter une personne » depuis le Retour : Inès": () => [{ kind: "addPerson", firstName: "Inès" }, personWhy("noRetour", "Inès")],
  "« Modifier » la voiture : Sophie, retour": () => [{ kind: "editRide", driver: "Sophie", leg: "retour" }, whyOf("noRetour")],
  // #266, decision 47: a sheet of the aller that sent on the retour too, closed before the answer.
  "« Proposer une voiture » depuis l’Aller, « Je ramène aussi », feuille fermée : Claire": () => [
    { kind: "offerRide", driver: "Claire", legs: "both" },
    noRetourAgain("offerRide"),
  ],
  "« Proposer une voiture » depuis l’Aller, « Je cherche une place » au retour, feuille fermée : Claire": () => [
    { kind: "offerRide", driver: "Claire", legs: "aller" },
    noRetourAgain("offerRide"),
  ],
  "« Ajouter une personne » depuis l’Aller, « Aller et retour », feuille fermée : Inès": () => [
    { kind: "addPerson", firstName: "Inès" },
    noRetourAgain("addPerson"),
  ],
};

// #265, decision 40: a sheet of the retour refused by `noRetour` says what was not done, then
// `Actions.why.noRetour`, word for word as « Chaque échec de la v3.3, mot pour mot » says it
// (docs/design/organizer-view/README.md, v3.3.6). #266, decision 47: a sheet of the aller closed
// before its answer says what to do again, `Actions.why.noRetourAgain`.
describe("failureText: each `noRetour` failure, word for word (v3.3)", () => {
  const readme = readFileSync(new URL("../../../docs/design/organizer-view/README.md", import.meta.url), "utf8").split("\n");
  const start = readme.indexOf("### Chaque échec de la v3.3, mot pour mot (amendement de C11.11)");
  const end = readme.findIndex((line, index) => index > start && line.startsWith("### "));
  const table = readme
    .slice(start, end)
    .filter((line) => line.startsWith("| ") && /`why\.noRetour(Again)?`/.test(line))
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .map(([, action, failure, fr, en]) => ({ action, failure, fr, en }));

  it("reads every row of `why.noRetour` and `why.noRetourAgain`, and knows each", () => {
    expect(new Set(table.map((row) => row.action))).toEqual(new Set(Object.keys(NO_RETOUR)));
  });

  for (const { action, failure, fr, en } of table) {
    it(action, () => {
      expect(failure).toBe("`noRetour`");
      const [notDone, why] = NO_RETOUR[action]();
      expect(failureText(words("fr"), notDone, why)).toBe(fr);
      expect(failureText(words("en"), notDone, why)).toBe(en);
    });
  }
});

// remove-person v2, « Refus et échecs » (RP1.7): what a removal that failed says, in its
// confirmation while it is open, in the bar once it is closed.
describe("removalProblem: « Retirer de l’événement »", () => {
  it("offline or on an error, the problem, whose red button stays; a refusal that sending again would not change, its reason", () => {
    expect(removalProblem("offline")).toEqual({ problem: "offline", final: false });
    expect(removalProblem("failed")).toEqual({ problem: "failed", final: false });
    for (const error of ["forbidden", "eventNotFound", "eventEnded"] as const) expect(removalProblem(error)).toEqual({ problem: error, final: true });
  });

  it("`invalid`, which no page sends: the generic failure", () => {
    expect(removalProblem("invalid")).toEqual({ problem: "failed", final: false });
  });

  it("in the bar, she is still part of the event, then why, word for word", () => {
    const notDone: NotDone = { kind: "removePerson", firstName: "Léa" };
    const said = (locale: Locale, error: Parameters<typeof removalProblem>[0]) => failureText(words(locale), notDone, whyOf(removalProblem(error).problem));
    expect(said("fr", "offline")).toBe("Léa fait toujours partie de l’événement. Vérifiez la connexion, puis réessayez.");
    expect(said("fr", "failed")).toBe("Léa fait toujours partie de l’événement. Une erreur est survenue : réessayez dans un instant.");
    expect(said("fr", "forbidden")).toBe("Léa fait toujours partie de l’événement. Cet appareil ne peut pas faire ce changement : rechargez la page.");
    expect(said("fr", "eventNotFound")).toBe("Léa fait toujours partie de l’événement. Cet événement est introuvable : il a peut-être été supprimé.");
    expect(said("fr", "eventEnded")).toBe("Léa fait toujours partie de l’événement. Cet événement est terminé : ses inscriptions ont été effacées.");
    expect(said("en", "forbidden")).toBe("Léa is still part of the event. This device cannot make this change: reload the page.");
    expect(said("en", "invalid")).toBe("Léa is still part of the event. Something went wrong: try again in a moment.");
  });
});
