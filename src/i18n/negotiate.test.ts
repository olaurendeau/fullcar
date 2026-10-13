import { describe, expect, it } from "vitest";
import { negotiateLocale } from "./negotiate";

describe("negotiateLocale", () => {
  it("prefers the cookie over the browser", () => {
    expect(negotiateLocale("en", "fr-FR,fr;q=0.9")).toBe("en");
  });

  it("ignores an unsupported cookie", () => {
    expect(negotiateLocale("de", "en-US,en;q=0.9")).toBe("en");
  });

  it("follows Accept-Language quality, not order", () => {
    expect(negotiateLocale(undefined, "de;q=1, en;q=0.5, fr;q=0.8")).toBe("fr");
  });

  it("matches a regional tag on its language", () => {
    expect(negotiateLocale(undefined, "en-GB")).toBe("en");
  });

  it("skips languages refused with q=0", () => {
    expect(negotiateLocale(undefined, "en;q=0, fr;q=0.1")).toBe("fr");
  });

  it("falls back to French", () => {
    expect(negotiateLocale(undefined, null)).toBe("fr");
    expect(negotiateLocale(undefined, "de, es")).toBe("fr");
  });
});
