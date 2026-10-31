import { createFormatter, createTranslator, type Messages } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { failureText, stopGoneText, wordsOf } from "./failure-words";
import { boardingStopTaken, boardingStopText } from "./stop-sheet";

const paul = { id: "p1", firstName: "Paul" };
const frWords = wordsOf(createTranslator<Messages>({ locale: "fr", messages: fr }), createFormatter({ locale: "fr" }));
const enWords = wordsOf(createTranslator<Messages>({ locale: "en", messages: en }), createFormatter({ locale: "en" }));

/** What the bar says of a point not changed, as a failure of the page. */
const notChanged = (words: typeof frWords, taken: ReturnType<typeof boardingStopTaken>) => {
  if (taken.kind === "done") throw new Error("A refusal is not a success.");
  return failureText(words, { kind: "stop", firstName: "Paul" }, taken.why);
};

describe("boardingStopTaken", () => {
  it("RV4.2: a success is done, and keeps `stopGone` (the words of RV3.4, RV4.3)", () => {
    expect(boardingStopTaken({ ok: true, value: { ok: true } }, paul)).toEqual({ kind: "done" });
    expect(boardingStopTaken({ ok: true, value: { ok: true, stopGone: true } }, paul)).toEqual({ kind: "done", stopGone: true });
    expect(stopGoneText(frWords, ["Paul"])).toBe("Ce point n’existe plus : Paul monte au lieu de départ.");
  });

  it("RV4.3: offline and a server error, in the sheet's words and the bar's", () => {
    const offline = boardingStopTaken({ ok: false, problem: "offline" }, paul);
    expect(offline).toMatchObject({ kind: "failed", message: "offline" });
    expect(notChanged(frWords, offline)).toBe("Le point de Paul n’a pas été changé. Vérifiez la connexion, puis réessayez.");
    const failed = boardingStopTaken({ ok: false, problem: "failed" }, paul);
    expect(failed).toMatchObject({ kind: "failed", message: "failed" });
    expect(notChanged(frWords, failed)).toBe("Le point de Paul n’a pas été changé. Une erreur est survenue : réessayez dans un instant.");
    expect(notChanged(enWords, offline)).toMatch(/^Paul’s boarding point was not changed\. /);
  });

  it("RV4.3: the car gone says so in the sheet and in the bar", () => {
    const gone = boardingStopTaken({ ok: true, value: { ok: false, error: "rideGone" } }, paul);
    expect(gone).toMatchObject({ kind: "failed", message: "rideGone" });
    expect(notChanged(frWords, gone)).toBe("Le point de Paul n’a pas été changé. Cette voiture n’est plus proposée.");
  });

  it("the other refusals are the generic problem in the sheet, their own reason in the bar", () => {
    for (const error of ["invalid", "stopsOff", "notInCar"] as const) {
      expect(boardingStopTaken({ ok: true, value: { ok: false, error } }, paul)).toMatchObject({ kind: "failed", message: "failed", why: { kind: "failed" } });
    }
    for (const error of ["forbidden", "eventNotFound", "eventEnded"] as const) {
      expect(boardingStopTaken({ ok: true, value: { ok: false, error } }, paul)).toMatchObject({ kind: "failed", message: "failed", why: { kind: error } });
    }
  });

  it("a person removed from the event closes the sheet, and the bar names her", () => {
    const taken = boardingStopTaken({ ok: true, value: { ok: false, error: "personGone", goneIds: ["p1"] } }, paul);
    expect(taken.kind).toBe("personGone");
    expect(notChanged(frWords, taken)).toBe("Le point de Paul n’a pas été changé. Paul ne fait plus partie de l’événement.");
  });
});

describe("boardingStopText", () => {
  it("RV4.2: « {prénom} monte à {lieu} », or at the departure place", () => {
    expect(boardingStopText(frWords, "Paul", "Briançon carrefour")).toBe("Paul monte à Briançon carrefour");
    expect(boardingStopText(frWords, "Paul", null)).toBe("Paul monte au lieu de départ");
    expect(boardingStopText(enWords, "Paul", "Briançon carrefour")).toBe("Paul boards at Briançon carrefour");
    expect(boardingStopText(enWords, "Paul", null)).toBe("Paul boards at the departure place");
  });
});
