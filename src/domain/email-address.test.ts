import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMAIL_MAX, emailAddress } from "./email-address";
import { browserUnsafeReached } from "./test-browser-safe";

/** A well-formed address of `length` characters (200 to 260): a 64-character local part, then 63-character labels. */
function addressOfLength(length: number): string {
  const last = length - 64 - 1 - (63 + 1) * 2 - ".fr".length;
  const address = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(last)}.fr`;
  expect(address.length).toBe(length);
  return address;
}

describe("emailAddress", () => {
  // OA1.4, on the server: the same rules as the form.
  describe("OA1.4", () => {
    it("reads an empty address as a missing field", () => {
      expect(emailAddress("")).toEqual({ error: "required" });
    });

    it("refuses « abc »", () => {
      expect(emailAddress("abc")).toEqual({ error: "invalid" });
    });

    it("refuses 255 characters, and accepts 254", () => {
      expect(EMAIL_MAX).toBe(254);
      expect(emailAddress(addressOfLength(255))).toEqual({ error: "tooLong" });
      expect(emailAddress(addressOfLength(254))).toEqual({ value: addressOfLength(254) });
    });

    it("says too long before invalid: 255 characters of anything", () => {
      expect(emailAddress("x".repeat(255))).toEqual({ error: "tooLong" });
    });
  });

  it("reads a missing value, or only spaces, as a missing field", () => {
    for (const empty of [undefined, null, "   ", "\t\n"]) {
      expect(emailAddress(empty)).toEqual({ error: "required" });
    }
  });

  it("refuses, without throwing, a value that is not a string", () => {
    for (const forged of [42, true, ["a@b.fr"], { toString: () => "a@b.fr" }]) {
      expect(() => emailAddress(forged)).not.toThrow();
      expect(emailAddress(forged)).toEqual({ error: "invalid" });
    }
  });

  it("trims and lowercases, so that one address is one account", () => {
    expect(emailAddress("  Camille.Durand@Exemple.FR \n")).toEqual({ value: "camille.durand@exemple.fr" });
  });

  it("writes an accented address in NFC, whichever way it was typed", () => {
    const composed = "andré@exemple.fr";
    const decomposed = "andré@exemple.fr";
    expect(emailAddress(decomposed)).toEqual({ value: composed });
    expect(emailAddress("ANDRÉ@EXEMPLE.FR")).toEqual({ value: composed });
  });

  it("counts length after normalisation, in characters", () => {
    const decomposed = `${"é".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(58)}.fr`;
    expect(decomposed.length).toBe(318);
    expect(emailAddress(decomposed)).toEqual({ value: decomposed.normalize("NFC") });
  });

  it.each([
    ["no @", "camille.exemple.fr"],
    ["two @", "camille@durand@exemple.fr"],
    ["nothing before @", "@exemple.fr"],
    ["nothing after @", "camille@"],
    ["a domain without a dot", "camille@localhost"],
    ["an empty label", "camille@exemple..fr"],
    ["a domain ending with a dot", "camille@exemple.fr."],
    ["a label starting with a hyphen", "camille@-exemple.fr"],
    ["a label ending with a hyphen", "camille@exemple-.fr"],
    ["a label of 64 characters", `camille@${"b".repeat(64)}.fr`],
    ["a numeric top-level domain", "camille@192.168.0.1"],
    ["a local part of 65 characters", `${"a".repeat(65)}@exemple.fr`],
    ["a space inside", "camille durand@exemple.fr"],
    ["a control character", "camille\u0000@exemple.fr"],
    ["angle brackets", "<camille@exemple.fr>"],
    ["a display name", "Camille <camille@exemple.fr>"],
    ["a comma", "camille@exemple.fr,autre@exemple.fr"],
  ])("refuses %s", (_, address) => {
    expect(emailAddress(address)).toEqual({ error: "invalid" });
  });

  it.each([
    ["a plus sign", "camille+fullcar@exemple.fr"],
    ["a subdomain", "camille@mail.exemple.co.uk"],
    ["digits and hyphens in the domain", "c@club-42.exemple.fr"],
    ["a local part of 64 characters", `${"a".repeat(64)}@exemple.fr`],
    ["a label of 63 characters", `camille@${"b".repeat(63)}.fr`],
    ["an internationalised domain", "camille@bücher.de"],
    ["a punycode domain", "camille@xn--bcher-kva.de"],
  ])("accepts %s", (_, address) => {
    expect(emailAddress(address)).toEqual({ value: address });
  });

  it("uses nothing from Node, so the form can check the address in the browser", () => {
    const file = new URL("./email-address.ts", import.meta.url);
    expect(browserUnsafeReached(readFileSync(file, "utf8"), file.pathname)).toEqual([]);
  });
});
