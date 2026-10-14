import { describe, expect, it } from "vitest";
import { FIRST_NAME_MAX, PERSON_FIELDS, validatePerson, type PersonFields } from "./person";

function personOf(fields: PersonFields) {
  const result = validatePerson(fields);
  if (!result.ok) throw new Error(`expected a person, got ${JSON.stringify(result.errors)}`);
  return result.person;
}

function failureOf(fields: PersonFields) {
  const result = validatePerson(fields);
  if (result.ok) throw new Error("expected errors, got a valid person");
  return result;
}

describe("validatePerson", () => {
  it("lists its fields in the order of the form", () => {
    expect(PERSON_FIELDS).toEqual(["firstName", "phone"]);
    expect(FIRST_NAME_MAX).toBe(40);
  });

  it("returns the person, trimmed", () => {
    expect(personOf({ firstName: "  Louise ", phone: " 06 12 34 56 78 " })).toEqual({
      firstName: "Louise",
      phone: "06 12 34 56 78",
    });
  });

  describe("first name (R1)", () => {
    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["blank", "   "],
      ["invisible", "​‍"],
    ])("C1.8: is required, so a %s first name is an error", (_, firstName) => {
      expect(failureOf({ firstName }).errors).toEqual({ firstName: "required" });
    });

    it("C1.8: accepts 1 and 40 characters, refuses 41", () => {
      expect(personOf({ firstName: "L" }).firstName).toBe("L");
      expect(personOf({ firstName: "a".repeat(40) }).firstName).toBe("a".repeat(40));
      expect(failureOf({ firstName: "a".repeat(41) }).errors).toEqual({ firstName: "tooLong" });
    });

    it("C1.8: counts an emoji as one character", () => {
      expect(personOf({ firstName: "\u{1f600}".repeat(40) }).firstName).toBe("\u{1f600}".repeat(40));
      expect(failureOf({ firstName: "\u{1f600}".repeat(41) }).errors).toEqual({ firstName: "tooLong" });
    });

    it("refuses a NUL character as invalid", () => {
      expect(failureOf({ firstName: "Lou\u0000" }).errors).toEqual({ firstName: "invalid" });
    });
  });

  describe("phone (R1)", () => {
    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["blank", "  \t "],
      ["invisible", "​"],
    ])("is optional: a %s phone is none", (_, phone) => {
      expect(personOf({ firstName: "Louise", phone }).phone).toBeNull();
    });

    it.each([
      ["digits only", "0612345678"],
      ["spaces", "06 12 34 56 78"],
      ["an international prefix", "+33 6 12 34 56 78"],
      ["dots", "06.12.34.56.78"],
      ["dashes and brackets", "(0)6-12-34-56-78"],
      ["6 digits", "123456"],
      ["15 digits", "123456789012345"],
      ["25 characters", "+33 (0)6 12 34 56 78 9..."],
    ])("C1.8: accepts %s", (_, phone) => {
      expect(phone.length).toBeLessThanOrEqual(25);
      expect(personOf({ firstName: "Louise", phone }).phone).toBe(phone);
    });

    it.each([
      ["a letter", "06 12 34 56 7O"],
      ["a slash", "06/12/34/56/78"],
      ["a tab inside", "06\t12345678"],
      ["a zero-width space inside", "0612​345678"],
      ["fullwidth digits", "０６１２３４"],
      ["a NUL character", "061234\u00005678"],
      ["5 digits", "12345"],
      ["5 digits among symbols", "+(1) 2-3.4 5"],
      ["16 digits", "1234567890123456"],
      ["no digit at all", "+ . - ( )"],
    ])("C1.8: refuses %s as invalid", (_, phone) => {
      expect(failureOf({ firstName: "Louise", phone }).errors).toEqual({ phone: "invalid" });
    });

    it("C1.8: refuses 26 characters as too long", () => {
      const phone = "+33 (0)6 12 34 56 78 9....";
      expect(phone.length).toBe(26);
      expect(failureOf({ firstName: "Louise", phone }).errors).toEqual({ phone: "tooLong" });
    });

    it("measures the phone after trimming", () => {
      expect(personOf({ firstName: "Louise", phone: `  ${"1".repeat(15)}${" ".repeat(10)}  ` }).phone).toBe(
        "1".repeat(15),
      );
    });
  });

  it("C1.8: reports an error per field, and the first field in error", () => {
    const both = failureOf({ firstName: "", phone: "abc" });
    expect(both.errors).toEqual({ firstName: "required", phone: "invalid" });
    expect(both.first).toBe("firstName");

    const phoneOnly = failureOf({ firstName: "Louise", phone: "123" });
    expect(phoneOnly.errors).toEqual({ phone: "invalid" });
    expect(phoneOnly.first).toBe("phone");
  });
});
