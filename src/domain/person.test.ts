import { describe, expect, it } from "vitest";
import { FIRST_NAME_MAX, PERSON_FIELDS, validatePerson, validatePersonChange, type PersonFields } from "./person";

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

    describe("a pasted phone (#123)", () => {
      it.each([
        ["iOS bidi marks", "‪+33 6 12 34 56 78‬", "+33 6 12 34 56 78"],
        ["a zero-width space and a byte order mark", "​0612345678﻿", "0612345678"],
        ["a zero-width space inside", "0612​345678", "0612345678"],
        ["word joiners and directional isolates", "⁠⁦+33612345678⁩", "+33612345678"],
        ["no-break spaces", "06 12 34 56 78", "06 12 34 56 78"],
        ["narrow no-break spaces", "06 12 34 56 78", "06 12 34 56 78"],
        ["figure spaces", "06 12 34 56 78", "06 12 34 56 78"],
        ["leading and trailing no-break spaces", "  06 12 34 56 78 ", "06 12 34 56 78"],
      ])("C1.8: cleans %s, and returns the cleaned phone", (_, phone, cleaned) => {
        expect(personOf({ firstName: "Louise", phone }).phone).toBe(cleaned);
      });

      it("C1.8: measures the phone after cleaning", () => {
        const phone = "+33 (0)6 12 34 56 78 9...";
        expect(phone.length).toBe(25);
        expect(personOf({ firstName: "Louise", phone: `‪${phone}‬​` }).phone).toBe(phone);
        expect(failureOf({ firstName: "Louise", phone: `‪${phone}.‬` }).errors).toEqual({
          phone: "tooLong",
        });
      });

      it("reads a phone of invisible characters only as none", () => {
        expect(personOf({ firstName: "Louise", phone: "‪‬​﻿  " }).phone).toBeNull();
      });

      it.each([
        ["a letter", "‪06 12 34 56 7O‬"],
        ["an emoji", "‪06 12 34 56 78 \u{1f4de}‬"],
        ["an emoji after a zero-width joiner", "0612345678‍\u{1f4de}"],
        ["a tab after a no-break space", "06 \t12345678"],
        ["a NUL character", " 061234\u00005678"],
      ])("C1.8: still refuses %s as invalid", (_, phone) => {
        expect(failureOf({ firstName: "Louise", phone }).errors).toEqual({ phone: "invalid" });
      });
    });

    it("measures the phone after trimming", () => {
      expect(personOf({ firstName: "Louise", phone: `  ${"1".repeat(15)}${" ".repeat(10)}  ` }).phone).toBe(
        "1".repeat(15),
      );
    });
  });

  // Only a forged request sends these: a field error, never an exception.
  it.each<[keyof PersonFields, unknown]>([
    ["firstName", 42],
    ["firstName", { name: "Louise" }],
    ["phone", 612345678],
    ["phone", ["0612345678"]],
    ["phone", true],
  ])("refuses a forged %s of %j as invalid, without throwing", (field, value) => {
    expect(failureOf({ firstName: "Louise", [field]: value }).errors).toEqual({ [field]: "invalid" });
  });

  it("reads null as a missing value", () => {
    expect(failureOf({ firstName: null }).errors).toEqual({ firstName: "required" });
    expect(personOf({ firstName: "Louise", phone: null }).phone).toBeNull();
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

describe("validatePersonChange (C2.3)", () => {
  it("leaves out a field not sent, and reads the others as validatePerson does", () => {
    expect(validatePersonChange({})).toEqual({ ok: true, change: {} });
    expect(validatePersonChange({ phone: " 07 12 12 12 12 " })).toEqual({ ok: true, change: { phone: "07 12 12 12 12" } });
    expect(validatePersonChange({ firstName: " Clara ", phone: null })).toEqual({
      ok: true,
      change: { firstName: "Clara", phone: null },
    });
    expect(validatePersonChange({ firstName: null, phone: "12" })).toEqual({
      ok: false,
      errors: { firstName: "required", phone: "invalid" },
      first: "firstName",
    });
    expect(validatePersonChange({ phone: "12" })).toEqual({ ok: false, errors: { phone: "invalid" }, first: "phone" });
  });
});
