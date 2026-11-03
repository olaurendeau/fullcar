import { describe, expect, it } from "vitest";
import { publicPageMetadata, publicPaths, siteOrigin } from "./site";

describe("siteOrigin (#412)", () => {
  it("is the production domain Vercel gives every deployment, over https", () => {
    expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "fullcar.example" })).toBe("https://fullcar.example");
  });

  it("never is the deployment's own URL: a preview's or a commit's is not the site's", () => {
    expect(
      siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "fullcar.example", VERCEL_URL: "fullcar-git-x.vercel.app" }),
    ).toBe("https://fullcar.example");
    expect(siteOrigin({ VERCEL_URL: "fullcar-git-x.vercel.app" })).toBe("http://localhost:3000");
  });

  it("off Vercel, is where `next start` listens, as Next.js itself falls back to", () => {
    expect(siteOrigin({})).toBe("http://localhost:3000");
    expect(siteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "  " })).toBe("http://localhost:3000");
    expect(siteOrigin({ PORT: "3010" })).toBe("http://localhost:3010");
  });

  it("reads the process's environment by default", () => {
    expect(siteOrigin()).toBe(siteOrigin(process.env));
  });
});

describe("the public pages (#412)", () => {
  it("are the home page, the creation form and the privacy page, and no event", () => {
    expect(publicPaths).toEqual(["/", "/nouveau", "/confidentialite"]);
  });

  it("each names its own path as canonical, resolved against the root layout's metadataBase", () => {
    expect(publicPageMetadata("/")).toEqual({ alternates: { canonical: "/" } });
    expect(publicPageMetadata("/nouveau")).toEqual({ alternates: { canonical: "/nouveau" } });
    expect(publicPageMetadata("/confidentialite")).toEqual({ alternates: { canonical: "/confidentialite" } });
  });
});
