import { describe, expect, it } from "vitest";
import { RIDE_LOCATION_MAX, RIDE_NOTE_MAX, type RideError } from "@/domain/ride";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { rideErrorMessage } from "./ride-error";

// Every code of the union, and nothing else: the typecheck fails on a code added to the domain.
const CODES = Object.keys({ required: true, tooLong: true, invalid: true, outOfRange: true } satisfies Record<RideError, true>) as RideError[];

describe("rideErrorMessage (C4.7)", () => {
  it.each([
    ["location", "required", { key: "required" }],
    ["location", "tooLong", { key: "tooLong", values: { max: RIDE_LOCATION_MAX } }],
    ["location", "invalid", { key: "invalidText" }],
    ["time", "required", { key: "required" }],
    ["time", "invalid", { key: "invalidTime" }],
    ["seats", "required", { key: "required" }],
    ["seats", "invalid", { key: "seats" }],
    ["seats", "outOfRange", { key: "seats" }],
    ["note", "tooLong", { key: "tooLong", values: { max: RIDE_NOTE_MAX } }],
    ["note", "invalid", { key: "invalidText" }],
  ] as const)("says %s %s with %o", (field, code, message) => {
    expect(rideErrorMessage(field, code)).toEqual(message);
  });

  it("names a key of FormErrors in both languages for every code of every field", () => {
    for (const field of ["location", "time", "seats", "note"] as const) {
      for (const code of CODES) {
        const { key } = rideErrorMessage(field, code);
        expect(fr.FormErrors[key]).toBeTruthy();
        expect(en.FormErrors[key]).toBeTruthy();
      }
    }
  });
});
