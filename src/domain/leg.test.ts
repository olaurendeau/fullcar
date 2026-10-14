import { describe, expect, it } from "vitest";
import { LEGS, eventLegs, initialLegs, otherLeg } from "./leg";

describe("legs", () => {
  it("aller comes first", () => {
    expect(LEGS).toEqual(["aller", "retour"]);
  });

  it("otherLeg swaps aller and retour", () => {
    expect(otherLeg("aller")).toBe("retour");
    expect(otherLeg("retour")).toBe("aller");
  });

  it("eventLegs: both legs with a retour, the aller alone without", () => {
    expect(eventLegs("2026-12-12 18:00:00")).toEqual(["aller", "retour"]);
    expect(eventLegs(null)).toEqual(["aller"]);
  });
});

describe("initialLegs: where a new person is without a car", () => {
  it("C1.3: « Aller et retour » checked, without a car on both legs, whichever tab", () => {
    expect(initialLegs({ bothLegs: true, leg: "aller", hasRetour: true })).toEqual(["aller", "retour"]);
    expect(initialLegs({ bothLegs: true, leg: "retour", hasRetour: true })).toEqual(["aller", "retour"]);
  });

  it("C1.3: unchecked, without a car on the current tab's leg only, not concerned by the other", () => {
    expect(initialLegs({ bothLegs: false, leg: "aller", hasRetour: true })).toEqual(["aller"]);
    expect(initialLegs({ bothLegs: false, leg: "retour", hasRetour: true })).toEqual(["retour"]);
  });

  it("C1.4: without a retour, the box is absent and the person is without a car at the aller", () => {
    expect(initialLegs({ bothLegs: true, leg: "aller", hasRetour: false })).toEqual(["aller"]);
    expect(initialLegs({ bothLegs: false, leg: "aller", hasRetour: false })).toEqual(["aller"]);
  });

  it("C4.4: a new person created as a driver is in their car, and not concerned by the other leg", () => {
    expect(initialLegs({ bothLegs: false, leg: "aller", hasRetour: true, drives: true })).toEqual([]);
    expect(initialLegs({ bothLegs: false, leg: "retour", hasRetour: true, drives: true })).toEqual([]);
    expect(initialLegs({ bothLegs: false, leg: "aller", hasRetour: false, drives: true })).toEqual([]);
  });

  it("C4.4: a driver is never without a car on the other leg, even if the box were sent checked", () => {
    expect(initialLegs({ bothLegs: true, leg: "aller", hasRetour: true, drives: true })).toEqual([]);
  });
});
