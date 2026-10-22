import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { diffMessages, flattenKeys } from "./keys";

type Messages = Parameters<typeof diffMessages>[0];

describe("flattenKeys", () => {
  it("dots nested keys", () => {
    expect(flattenKeys({ a: { b: "x", c: { d: "y" } }, e: "z" })).toEqual(["a.b", "a.c.d", "e"]);
  });
});

describe("diffMessages", () => {
  it("reports missing, extra and empty translations", () => {
    expect(diffMessages({ a: "1", b: { c: "2" } }, { a: " ", d: "3" })).toEqual({
      missing: ["b.c"],
      extra: ["d"],
      empty: ["a"],
    });
  });

  it("is clean when both locales match", () => {
    expect(diffMessages({ a: { b: "1" } }, { a: { b: "one" } })).toEqual({
      missing: [],
      extra: [],
      empty: [],
    });
  });
});

describe("messages/fr.json and messages/en.json (#390)", () => {
  it("have exactly the same keys, at every depth", () => {
    // Key paths only: a failure names the keys, never the text of a message.
    const { missing, extra } = diffMessages(fr as Messages, en as Messages);
    expect({ onlyInFr: missing, onlyInEn: extra }).toEqual({ onlyInFr: [], onlyInEn: [] });
  });
});
