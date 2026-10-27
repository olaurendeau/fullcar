import { afterEach, describe, expect, it, vi } from "vitest";
import sitemap from "./sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sitemap (#412)", () => {
  it("lists the public pages, on the production domain", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "fullcar.example");
    expect(sitemap()).toEqual([
      { url: "https://fullcar.example/" },
      { url: "https://fullcar.example/nouveau" },
      { url: "https://fullcar.example/confidentialite" },
    ]);
  });

  it("never lists an event, nor its organiser's page", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "fullcar.example");
    expect(sitemap().filter(({ url }) => new URL(url).pathname.startsWith("/e/")).length).toBe(0);
  });

  it("off Vercel, on the origin `next start` listens on", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("PORT", "");
    expect(sitemap().map(({ url }) => url)).toEqual([
      "http://localhost:3000/",
      "http://localhost:3000/nouveau",
      "http://localhost:3000/confidentialite",
    ]);
  });
});
