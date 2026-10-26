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

  // #626: one mailbox, one account, whether its domain is typed in Unicode or in punycode.
  describe("an internationalised domain", () => {
    it("is written in punycode, so that both forms are one address", () => {
      const ascii = { value: "camille@xn--bcher-kva.de" };
      expect(emailAddress("camille@bücher.de")).toEqual(ascii);
      expect(emailAddress("camille@xn--bcher-kva.de")).toEqual(ascii);
      expect(emailAddress("CAMILLE@BÜCHER.DE")).toEqual(ascii);
      expect(emailAddress("Camille@XN--BCHER-KVA.DE")).toEqual(ascii);
      expect(emailAddress("camille@bu\u0308cher.de")).toEqual(ascii);
    });

    it("converts every label, in any script", () => {
      expect(emailAddress("camille@courrier.日本.jp")).toEqual({ value: "camille@courrier.xn--wgv71a.jp" });
      expect(emailAddress("camille@bücher.xn--p1ai")).toEqual({ value: "camille@xn--bcher-kva.xn--p1ai" });
    });

    // 57 « ü » make a label of 63 characters in punycode: these domains grow by 6 characters.
    const umlauts = (count: number) => "u\u0308".repeat(count);

    it("counts length after normalisation and conversion: 254 characters in punycode, not as typed", () => {
      const typed = (last: number) => `${"a".repeat(64)}@${umlauts(57)}.${"c".repeat(63)}.${"d".repeat(last)}.fr`;
      expect(typed(58).length).toBe(305);
      expect([...typed(58).normalize("NFC")].length).toBe(248);
      const accepted = emailAddress(typed(58));
      expect("value" in accepted && accepted.value.length).toBe(254);
      expect(emailAddress(typed(59))).toEqual({ error: "tooLong" });
    });

    it("counts a label's 63 characters after conversion", () => {
      const accepted = emailAddress(`camille@${umlauts(57)}.de`);
      expect("value" in accepted && accepted.value.split(/[@.]/)[1]).toMatch(/^xn--[a-z0-9]{59}$/);
      expect(emailAddress(`camille@${umlauts(58)}.de`)).toEqual({ error: "invalid" });
    });

    it.each([
      ["a label starting with a combining mark", "camille@\u0301bc.de"],
      ["a label mixing right-to-left and left-to-right letters", "camille@a\u05d0.de"],
      ["a punycode label that decodes to a control character", "camille@xn--a.de"],
      ["a punycode label of a decomposed « ü », not in NFC", "camille@xn--bucher-xyd.de"],
      ["a punycode label of the ligature « \ufb01 », written « fi »", "camille@xn--x-sy8h.de"],
      ["a punycode label that does not decode", "camille@xn--99999999999.de"],
      ["a domain that becomes an IP address", "camille@1.0x7f"],
    ])("refuses %s", (_, address) => {
      expect(emailAddress(address)).toEqual({ error: "invalid" });
    });
  });

  // #626: nothing shows that Brevo delivers to a local part outside ASCII (SMTPUTF8).
  it.each([
    ["an accented local part", "andré@exemple.fr"],
    ["a decomposed accent in the local part", "andre\u0301@exemple.fr"],
    ["a local part in another script", "δοκιμή@exemple.fr"],
  ])("refuses %s", (_, address) => {
    expect(emailAddress(address)).toEqual({ error: "invalid" });
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
  ])("accepts %s", (_, address) => {
    expect(emailAddress(address)).toEqual({ value: address });
  });

  it("uses nothing from Node, so the form can check the address in the browser", () => {
    const file = new URL("./email-address.ts", import.meta.url);
    expect(browserUnsafeReached(readFileSync(file, "utf8"), file.pathname)).toEqual([]);
  });
});
