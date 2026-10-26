import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";

type Messages = { [key: string]: string | Messages };

/** Every value under `messages`, at any depth, with its dotted key. */
function values(messages: Messages | string, path: string): [string, string][] {
  if (typeof messages === "string") return [[path, messages]];
  return Object.entries(messages).flatMap(([key, value]) => values(value, path ? `${path}.${key}` : key));
}

// event-board v4.5 (#649): « drive back » reads as the driver's own way home, empty (E1.4).
describe("E1.4: the English words never say « drive back »", () => {
  it("no value of messages/en.json holds it, whatever its case", () => {
    const found = values(en as Messages, "").filter(([, value]) => /drive back/i.test(value));
    expect(found).toEqual([]);
  });

  it("reads the values at any depth", () => {
    expect(values(en as Messages, "")).toContainEqual(["RideForm.otherLeg.title.retour", "On the return trip"]);
  });
});
