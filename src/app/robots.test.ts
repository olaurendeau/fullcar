import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots (#412)", () => {
  it("lets every crawler in, but not in the Sentry tunnel", () => {
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/monitoring"] });
  });

  it("never keeps a crawler out of an event: it must read its noindex, or it may list the bare URL, which gives access", () => {
    const rules = [robots().rules].flat();
    const disallowed = rules.flatMap(({ disallow }) => [disallow ?? []].flat());
    expect(disallowed.filter((path) => "/e/x".startsWith(path) || path.startsWith("/e")).length).toBe(0);
  });

  it("points to the sitemap, on the production domain", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "fullcar.example");
    expect(robots().sitemap).toBe("https://fullcar.example/sitemap.xml");
  });
});
