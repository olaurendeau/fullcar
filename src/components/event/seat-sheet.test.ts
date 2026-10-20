import { createFormatter, createTranslator, type Messages } from "next-intl";
import { describe, expect, it } from "vitest";
import fr from "../../../messages/fr.json";
import { failureText, wordsOf } from "./failure-words";
import { seatsTaken } from "./seat-sheet";

describe("seatsTaken", () => {
  // The retour removed while the sheet was open (decision 40): no words of its own until #265, the generic failure.
  it("says the generic failure of a `noRetour` answer", () => {
    const taken = seatsTaken({ ok: true, value: { ok: false, error: "noRetour" } }, ["Léa"]);
    expect(taken).toEqual({ kind: "problem", problem: "failed", why: { kind: "failed" } });
    if (taken.kind === "done") throw new Error("A refusal is not a success.");
    const words = wordsOf(createTranslator<Messages>({ locale: "fr", messages: fr }), createFormatter({ locale: "fr" }));
    const failed = failureText(words, { kind: "seats", names: ["Léa"], driver: "Tom" }, { kind: "failed" });
    expect(failureText(words, { kind: "seats", names: ["Léa"], driver: "Tom" }, taken.why)).toBe(failed);
  });
});
