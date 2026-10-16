import { describe, expect, it } from "vitest";
import { optionalText, text } from "./text";

const INVISIBLES: [string, string][] = [
  ["nothing", ""],
  ["spaces, tabs and newlines", " \t\n "],
  ["zero-width spaces and joiners", "​‌‍⁠﻿"],
  ["direction marks", "‎‏‪‬"],
];

describe("text", () => {
  it("returns the value trimmed", () => {
    expect(text("  Gare de Lyon\n", 120)).toEqual({ value: "Gare de Lyon" });
  });

  it("reads a missing value as empty", () => {
    expect(text(undefined, 40)).toEqual({ error: "required" });
  });

  it.each(INVISIBLES)("counts text with only %s as empty", (_, invisible) => {
    expect(text(invisible, 40)).toEqual({ error: "required" });
  });

  it("keeps invisible characters inside visible text", () => {
    const family = "\u{1f468}‍\u{1f469}‍\u{1f467}";
    expect(text(` ${family} `, 40)).toEqual({ value: family });
  });

  it("counts length in code points: an emoji is one character", () => {
    expect(text("\u{1f697}".repeat(40), 40)).toEqual({ value: "\u{1f697}".repeat(40) });
    expect(text("\u{1f697}".repeat(41), 40)).toEqual({ error: "tooLong" });
  });

  it("accepts the maximum length and refuses one more", () => {
    expect(text("a".repeat(120), 120)).toEqual({ value: "a".repeat(120) });
    expect(text("a".repeat(121), 120)).toEqual({ error: "tooLong" });
  });

  it("reads null as a missing value", () => {
    expect(text(null, 40)).toEqual({ error: "required" });
    expect(optionalText(null, 40)).toEqual({ value: null });
  });

  it.each([42, true, {}, ["Louise"]])("refuses %j, which is not text, as invalid without throwing", (value) => {
    expect(text(value, 40)).toEqual({ error: "invalid" });
    expect(optionalText(value, 40)).toEqual({ error: "invalid" });
  });

  it.each([
    ["inside visible text", "Lou\u0000ise"],
    ["alone", "\u0000"],
    ["among blanks", " \u0000 "],
  ])("refuses a NUL character %s as invalid", (_, value) => {
    expect(text(value, 40)).toEqual({ error: "invalid" });
  });
});

describe("optionalText", () => {
  it.each([...INVISIBLES, ["a missing value", undefined] as [string, undefined]])(
    "reads %s as no text",
    (_, value) => {
      expect(optionalText(value, 200)).toEqual({ value: null });
    },
  );

  it("returns the value trimmed", () => {
    expect(optionalText("  Coffre plein \n", 200)).toEqual({ value: "Coffre plein" });
  });

  it("accepts the maximum length in code points and refuses one more", () => {
    expect(optionalText("\u{1f697}".repeat(200), 200)).toEqual({ value: "\u{1f697}".repeat(200) });
    expect(optionalText("a".repeat(201), 200)).toEqual({ error: "tooLong" });
  });

  it("refuses a NUL character, even among blanks", () => {
    expect(optionalText(" \u0000 ", 200)).toEqual({ error: "invalid" });
  });
});
