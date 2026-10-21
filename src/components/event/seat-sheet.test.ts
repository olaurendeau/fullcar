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
});
