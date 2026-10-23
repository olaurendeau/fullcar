import { describe, expect, it } from "vitest";
import { metadata } from "./layout";
import { siteOrigin } from "./site";

describe("the root layout's metadata (#412)", () => {
  it("resolves the canonical URLs against the site's origin, not Next.js's own fallback", () => {
    expect(String(metadata.metadataBase)).toBe(new URL(siteOrigin()).href);
  });

  it("names no canonical URL, which every page, an event's included, would inherit", () => {
    expect(metadata.alternates).toBeUndefined();
  });
});
