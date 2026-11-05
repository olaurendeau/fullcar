import { describe, expect, it } from "vitest";
import { namesake, sameFirstName } from "./namesake";

describe("sameFirstName (RL6.1)", () => {
  it.each(["carla", "CARLA", "Carla  "])("%j is Carla", (typed) => {
    expect(sameFirstName(typed, "Carla")).toBe(true);
  });

  it("ignores accents", () => {
    expect(sameFirstName("Maria", "María")).toBe(true);
  });

  it("ignores case and accents together", () => {
    expect(sameFirstName("jeanne ( AINE)", "Jeanne ( aîné)")).toBe(true);
  });

  it("counts inner spaces", () => {
    expect(sameFirstName("Jeanne (aîné)", "Jeanne ( aîné)")).toBe(false);
  });

  it("does not match a prefix", () => {
    expect(sameFirstName("Jean", "Jeanne")).toBe(false);
  });
});

describe("namesake (RL6.1)", () => {
  const persons = [{ firstName: "Ana" }, { firstName: "María" }, { firstName: "Maria" }];

  it("returns the person found, with the first name the device saved", () => {
    expect(namesake(persons, "maria")).toBe(persons[1]);
  });

  it("returns undefined when nobody has the name", () => {
    expect(namesake(persons, "Jean")).toBeUndefined();
  });

  it("matches nobody for an empty or blank name", () => {
    const blank = [{ firstName: "" }, { firstName: " " }];
    expect(namesake(blank, "")).toBeUndefined();
    expect(namesake(blank, "  ")).toBeUndefined();
  });
});
