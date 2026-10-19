import { describe, expect, it } from "vitest";
import { FIRST_NAME_MAX, PHONE_MAX, type PersonError } from "@/domain/person";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { personErrorMessage } from "./person-error";

// Every code of the union, and nothing else: the typecheck fails on a code added to the domain.
const CODES = Object.keys({ required: true, tooLong: true, invalid: true } satisfies Record<PersonError, true>) as PersonError[];

describe("personErrorMessage (C1.8)", () => {
  it("says a first name is required, too long, or has a character that is not allowed", () => {
    expect(personErrorMessage("firstName", "required")).toEqual({ key: "required" });
    expect(personErrorMessage("firstName", "tooLong")).toEqual({ key: "tooLong", values: { max: FIRST_NAME_MAX } });
    expect(personErrorMessage("firstName", "invalid")).toEqual({ key: "invalidText" });
  });

  it("says what a valid number is, and its length", () => {
    expect(personErrorMessage("phone", "invalid")).toEqual({ key: "invalidPhone" });
    expect(personErrorMessage("phone", "tooLong")).toEqual({ key: "tooLong", values: { max: PHONE_MAX } });
  });

  it("names a key of FormErrors in both languages for every code of both fields", () => {
    for (const field of ["firstName", "phone"] as const) {
      for (const code of CODES) {
        const { key } = personErrorMessage(field, code);
        expect(fr.FormErrors[key]).toBeTruthy();
        expect(en.FormErrors[key]).toBeTruthy();
      }
    }
  });
});
