import { createFormatter, createTranslator, type Messages } from "next-intl";
import { describe, expect, it } from "vitest";
import fr from "../../../messages/fr.json";
import { failureText, stopGoneText, wordsOf } from "./failure-words";
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

  // RV3.4: the point is gone before the send; the persons board at the departure, a success that says so.
  it("RV3.4: keeps `stopGone` on a success, and says it in the bar's words", () => {
    expect(seatsTaken({ ok: true, value: { ok: true, stopGone: true } }, ["Paul"])).toEqual({ kind: "done", stopGone: true });
    expect(seatsTaken({ ok: true, value: { ok: true } }, ["Paul"])).toEqual({ kind: "done" });
    const words = wordsOf(createTranslator<Messages>({ locale: "fr", messages: fr }), createFormatter({ locale: "fr" }));
    expect(stopGoneText(words, ["Paul"])).toBe("Ce point n’existe plus : Paul monte au lieu de départ.");
    expect(stopGoneText(words, ["Paul", "Léa"])).toBe("Ce point n’existe plus : Paul et Léa montent au lieu de départ.");
  });

  // RV3.5: the refusals keep their words, whatever point was chosen: none names it.
  it("RV3.5: a refusal says nothing of the point", () => {
    const words = wordsOf(createTranslator<Messages>({ locale: "fr", messages: fr }), createFormatter({ locale: "fr" }));
    const point = "Prelles boucherie";
    // The send as the page keeps it, the point chosen with it: the words must not pick it up.
    const sent = { kind: "seats" as const, names: ["Paul"], driver: "Nina", stop: { id: "s1", location: point } };
    const answers = [
      { ok: false as const, error: "seatTaken" as const },
      { ok: false as const, error: "notEnoughSeats" as const, freeSeats: 1 },
      { ok: false as const, error: "rideGone" as const },
      { ok: false as const, error: "alreadyInCar" as const },
      { ok: false as const, error: "forbidden" as const },
      { ok: false as const, error: "eventNotFound" as const },
    ];
    const texts = answers.map((answer) => {
      const taken = seatsTaken({ ok: true, value: answer }, ["Paul"]);
      if (taken.kind === "done") throw new Error("A refusal is not a success.");
      return failureText(words, sent, taken.why);
    });
    expect(texts[0]).toBe("Paul n’a pas pu monter dans la voiture de Nina. Cette place vient d’être prise.");
    for (const text of texts) {
      expect(text).toMatch(/^Paul n’a pas pu monter dans la voiture de Nina\./);
      expect(text).not.toContain(point);
      expect(text).not.toContain("Prelles");
    }
  });
});
