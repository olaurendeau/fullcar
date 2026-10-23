import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots (#412)", () => {
  it("lets every crawler in the public pages, keeps it out of the events and of the Sentry tunnel", () => {
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/e/", "/monitoring"] });
  });

  it("points to the sitemap, on the production domain", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "fullcar.example");
    expect(robots().sitemap).toBe("https://fullcar.example/sitemap.xml");
  });
});
