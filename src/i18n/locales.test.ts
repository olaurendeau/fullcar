import { describe, expect, it } from "vitest";
import { localeCookieOptions, otherLocale } from "./locales";

describe("otherLocale", () => {
  it("is English from French, and French from English", () => {
    expect(otherLocale("fr")).toBe("en");
    expect(otherLocale("en")).toBe("fr");
  });
});

describe("localeCookieOptions", () => {
  it("L2.2: the whole site, Lax, for 365 days", () => {
    expect(localeCookieOptions(false)).toEqual({
      path: "/",
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60,
      secure: false,
    });
  });

  it("L2.2: Secure as it is given", () => {
    expect(localeCookieOptions(true).secure).toBe(true);
    expect(localeCookieOptions(false).secure).toBe(false);
  });
});
