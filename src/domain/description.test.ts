import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX, description, descriptionCount, guessFolds, normalizeDescription } from "./description";
import { browserUnsafeReached } from "./test-browser-safe";

describe("normalizeDescription", () => {
  // DS1.4: one function, shared by the server and the counter.
  describe("DS1.4", () => {
    it.each([
      ["trims the start and the end", "  \n\tRendez-vous à 7 h\n \n", "Rendez-vous à 7 h"],
      ["turns \\r\\n into \\n", "a\r\nb", "a\nb"],
      ["turns a lone \\r into \\n", "a\rb\r\rc", "a\nb\n\nc"],
      ["removes spaces and tabs at the end of a line", "a  \t\nb\t \nc", "a\nb\nc"],
      ["removes a non-breaking and a narrow no-break space at the end of a line", "a\u00a0\nb\u202f\nc\u3000", "a\nb\nc"],
      ["turns four newlines into two", "a\n\n\n\nb", "a\n\nb"],
      ["turns three newlines into two", "a\n\n\nb", "a\n\nb"],
      ["keeps two newlines", "a\n\nb", "a\n\nb"],
      ["reads a line of blanks as empty before counting newlines", "a  \n \n\n\nb", "a\n\nb"],
      ["counts \\r\\n as one newline", "a\r\n\r\n\r\nb", "a\n\nb"],
      ["keeps spaces and tabs inside a line", "a  b\tc", "a  b\tc"],
      ["keeps spaces at the start of an inner line", "a\n    b", "a\n    b"],
      ["keeps a line separator, which is not a newline", "a \u2028b", "a \u2028b"],
    ])("%s", (_, typed, stored) => {
      expect(normalizeDescription(typed)).toBe(stored);
    });

    it("gives the same text twice", () => {
      const once = normalizeDescription(" a \r\n\r\n\r\n b\t\n");
      expect(normalizeDescription(once)).toBe(once);
    });
  });
});

describe("description", () => {
  it("returns the normalised text", () => {
    expect(description("Rendez-vous au parking  \r\n\r\n\r\n\r\nMatériel : gourde\n")).toEqual({
      value: "Rendez-vous au parking\n\nMatériel : gourde",
    });
  });

  // DS1.5: text without a visible character is no description, without an error.
  describe("DS1.5", () => {
    it.each([
      ["nothing", ""],
      ["spaces", "   "],
      ["newlines", "\n\n\r\n\r"],
      ["tabs and non-breaking spaces", "\t\u00a0\u202f"],
      ["zero-width characters", "\u200b\u200c\u200d\u2060\ufeff"],
      ["direction marks among newlines", "\u200e\n\u200f\n\u202a"],
      ["a missing value", undefined],
      ["null", null],
    ])("reads %s as no description", (_, value) => {
      expect(description(value)).toEqual({ value: null });
    });
  });

  // DS1.6: the length in code points, after normalisation.
  describe("DS1.6", () => {
    it("allows 1000 code points", () => {
      expect(DESCRIPTION_MAX).toBe(1000);
      expect(description("a".repeat(1000))).toEqual({ value: "a".repeat(1000) });
    });

    it("refuses 1001 code points as too long", () => {
      expect(description("a".repeat(1001))).toEqual({ error: "tooLong" });
    });

    it("counts an emoji as one", () => {
      const car = "\u{1f697}";
      expect(description(car.repeat(1000))).toEqual({ value: car.repeat(1000) });
      expect(description(car.repeat(1001))).toEqual({ error: "tooLong" });
    });

    it.each([
      ["trailing blanks", `${"a".repeat(1000)}   \t`],
      ["blanks at the end of each line", `${"a".repeat(499)}   \n${"b".repeat(500)}\t\t`],
      ["extra newlines", `${"a".repeat(499)}\n\n\n\n\n${"b".repeat(499)}`],
      ["\\r\\n", `${"a".repeat(499)}\r\n${"b".repeat(500)}`],
    ])("counts after normalisation: 1000 with %s passes", (_, typed) => {
      const result = description(typed);
      expect(result).toEqual({ value: normalizeDescription(typed) });
      expect([...normalizeDescription(typed)]).toHaveLength(1000);
    });
  });

  // DS1.8: NUL, and a value that is not a string, are refused without an exception.
  describe("DS1.8", () => {
    it.each([
      ["inside the text", "Rendez-vous\u0000 à 7 h"],
      ["alone", "\u0000"],
      ["among blanks", " \n\u0000\n "],
      ["in a text too long", `${"a".repeat(1001)}\u0000`],
    ])("refuses a NUL character %s as invalid", (_, value) => {
      expect(description(value)).toEqual({ error: "invalid" });
    });

    it.each([42, true, {}, ["Rendez-vous"], { toString: () => "Rendez-vous" }])(
      "refuses %j, which is not a string, as invalid without throwing",
      (value) => {
        expect(description(value)).toEqual({ error: "invalid" });
      },
    );
  });
});

describe("descriptionCount", () => {
  // DS1.7: the counter shows the length the server would count.
  describe("DS1.7", () => {
    it("counts 899 « a », four newlines, « b » and three trailing spaces as 902", () => {
      expect(descriptionCount(`${"a".repeat(899)}\n\n\n\nb   `)).toBe(902);
    });

    it.each([
      ["plain text", "Rendez-vous à 7 h"],
      ["trailing blanks and extra newlines", "a  \r\n\r\n\r\n\r\nb\t"],
      ["emoji", "\u{1f697}\u{1f468}\u200d\u{1f469}\u200d\u{1f467}"],
      ["1001 code points", "a".repeat(1001)],
      ["1200 pasted code points", `${"a ".repeat(600)}`],
    ])("counts %s as the server stores it", (_, field) => {
      const stored = description(field);
      const counted = "value" in stored && stored.value !== null ? [...stored.value].length : [...normalizeDescription(field)].length;
      expect(descriptionCount(field)).toBe(counted);
    });

    it("counts text with only invisible characters as 0, as the server stores none", () => {
      expect(descriptionCount("\u200b\n\u200d  \n")).toBe(0);
      expect(descriptionCount("")).toBe(0);
    });

    it("counts beyond the maximum, so that the counter can turn red", () => {
      expect(descriptionCount("a".repeat(1200))).toBe(1200);
    });
  });
});

describe("guessFolds", () => {
  // DS2.13: the server renders the button if and only if the description has more than
  // 4 lines by \n, or more than 140 code points.
  describe("DS2.13", () => {
    it.each([
      ["one short line", "Rendez-vous à 7 h", false],
      ["4 lines", "a\nb\nc\nd", false],
      ["5 lines", "a\nb\nc\nd\ne", true],
      ["4 lines with an empty one", "a\n\nb\nc", false],
      ["5 lines with empty ones", "a\n\nb\n\nc", true],
      ["140 code points", "a".repeat(140), false],
      ["141 code points", "a".repeat(141), true],
      ["140 emoji, one code point each", "\u{1f697}".repeat(140), false],
      ["141 emoji", "\u{1f697}".repeat(141), true],
      ["140 code points over 4 lines", `${"a".repeat(34)}\n${"b".repeat(34)}\n${"c".repeat(34)}\n${"d".repeat(35)}`, false],
      ["a line separator, which is not a newline", "a\u2028b\u2028c\u2028d\u2028e", false],
    ])("%s: %s", (_, text, folds) => {
      expect(guessFolds(text)).toBe(folds);
    });
  });
});

it("uses nothing from Node, so the counter can normalise in the browser", () => {
  const file = new URL("./description.ts", import.meta.url);
  expect(browserUnsafeReached(readFileSync(file, "utf8"), file.pathname)).toEqual([]);
});
