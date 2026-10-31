import { createFormatter, createTranslator, type Messages } from "next-intl";
import { describe, expect, it } from "vitest";
import fr from "../../../messages/fr.json";
import { failureText, wordsOf } from "./failure-words";
import { seatsTaken } from "./seat-sheet";

describe("seatsTaken", () => {
  // The retour removed while the sheet was open (decision 40, rule 9): the sheet closes, and the bar says why.
  it("says a `noRetour` answer in its own words, and closes the sheet", () => {
    const taken = seatsTaken({ ok: true, value: { ok: false, error: "noRetour" } }, ["Léa"]);
    expect(taken).toEqual({ kind: "noRetour", why: { kind: "noRetour" } });
    if (taken.kind === "done") throw new Error("A refusal is not a success.");
    const words = wordsOf(createTranslator<Messages>({ locale: "fr", messages: fr }), createFormatter({ locale: "fr" }));
    expect(failureText(words, { kind: "seats", names: ["Léa"], driver: "Tom" }, taken.why)).toBe(
      "Léa n’a pas pu monter dans la voiture de Tom. Il n’y a plus de retour pour cet événement.",
    );
  });

  // RV8.3: the option « Points de RDV » turned off while the sheet was open; no word of it for the sheet, the generic failure.
  it("says a `stopsOff` answer as the generic failure", () => {
    const taken = seatsTaken({ ok: true, value: { ok: false, error: "stopsOff" } }, ["Léa"]);
    expect(taken).toEqual({ kind: "problem", problem: "failed", why: { kind: "failed" } });
  });

  // RP5.4 (remove-person v2, state 22): a person sent is gone from the event; the sheet closes, and the bar names her.
  it("says a `personGone` answer with the first name of the one gone, and closes the sheet", () => {
    const answer = { ok: true as const, value: { ok: false as const, error: "personGone" as const, goneIds: ["p2"] } };
    const taken = seatsTaken(answer, ["Léa", "Tom"], ["p1", "p2"]);
    expect(taken).toEqual({ kind: "personGone", why: { kind: "personGone", firstName: "Tom" } });
    if (taken.kind === "done") throw new Error("A refusal is not a success.");
    const words = wordsOf(createTranslator<Messages>({ locale: "fr", messages: fr }), createFormatter({ locale: "fr" }));
    expect(failureText(words, { kind: "seats", names: ["Tom"], driver: "Claire" }, taken.why)).toBe(
      "Tom n’a pas pu monter dans la voiture de Claire. Tom ne fait plus partie de l’événement.",
    );
  });
});
