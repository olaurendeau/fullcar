import { describe, expect, it } from "vitest";
import { diffMessages, flattenKeys } from "./keys";

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
