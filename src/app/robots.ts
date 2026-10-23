import type { MetadataRoute } from "next";
import { siteOrigin } from "./site";

/**
 * `/robots.txt` (#412): the public pages, not the events, whose link gives access (they are in
 * noindex too, `src/app/e/layout.tsx`), nor the Sentry tunnel.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/e/", "/monitoring"] },
    sitemap: new URL("/sitemap.xml", siteOrigin()).href,
  };
}
