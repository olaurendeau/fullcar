import { describe, expect, it } from "vitest";
import type { DeviceState } from "./board";
import { otherLegField, otherLegKind, type OtherLegChoice } from "./offer";

const marc = { id: "marc", firstName: "Marc" };
const LEAVING: OtherLegChoice[] = ["drive", "stay", "withoutCar", "notConcerned"];
const STAYING_OUT: OtherLegChoice[] = ["drive", "withoutCar", "notConcerned"];

describe("otherLegField (C4.11, v4-8)", () => {
  it.each<[string, DeviceState | "new", ReturnType<typeof otherLegField>]>([
    ["a new person: « Je ne fais pas… » (C4.4)", "new", { choices: STAYING_OUT, chosen: "notConcerned", leaves: undefined }],
    ["not concerned: « Je ne fais pas… »", { kind: "notConcerned" }, { choices: STAYING_OUT, chosen: "notConcerned", leaves: undefined }],
    ["without a car: « Je cherche une place »", { kind: "withoutCar" }, { choices: STAYING_OUT, chosen: "withoutCar", leaves: undefined }],
    [
      "a passenger: « Je reste… », and every other choice leaves the car (C4.12)",
      { kind: "passenger", rideId: "car-of-marc", driver: marc },
      { choices: LEAVING, chosen: "stay", leaves: marc },
    ],
    ["driving there already: no field", { kind: "driver", rideId: "car-of-lea" }, undefined],
  ])("%s", (_, state, field) => {
    expect(otherLegField(state)).toEqual(field);
  });
});

describe("otherLegKind (C3.5)", () => {
  it("sends `keep` for the choice she is in already, whatever it is: nothing she did not choose changes", () => {
    for (const state of ["new", { kind: "notConcerned" }, { kind: "withoutCar" }, { kind: "passenger", rideId: "r", driver: marc }] as const) {
      const field = otherLegField(state)!;
      expect(otherLegKind(field, field.chosen)).toBe("keep");
    }
  });

  it("sends any other choice as it is", () => {
    const passenger = otherLegField({ kind: "passenger", rideId: "r", driver: marc })!;
    expect(["drive", "withoutCar", "notConcerned"].map((choice) => otherLegKind(passenger, choice as OtherLegChoice))).toEqual([
      "drive",
      "withoutCar",
      "notConcerned",
    ]);
    const without = otherLegField({ kind: "withoutCar" })!;
    expect(otherLegKind(without, "notConcerned")).toBe("notConcerned");
    expect(otherLegKind(without, "drive")).toBe("drive");
    expect(otherLegKind(otherLegField("new")!, "withoutCar")).toBe("withoutCar");
  });
});
