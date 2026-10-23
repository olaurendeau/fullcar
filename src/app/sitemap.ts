import type { MetadataRoute } from "next";
import { publicPaths, siteOrigin } from "./site";

/** `/sitemap.xml`: the public pages, never an event (#412). */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return publicPaths.map((path) => ({ url: new URL(path, origin).href }));
}
