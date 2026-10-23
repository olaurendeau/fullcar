import type { MetadataRoute } from "next";
import { siteOrigin } from "./site";

/**
 * `/robots.txt` (#412): everything but the Sentry tunnel. Not the events kept out: a crawler
 * must read their noindex (`src/app/e/layout.tsx`, and the X-Robots-Tag of `next.config.ts`),
 * or it may list a bare event URL, which alone gives access.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/monitoring"] },
    sitemap: new URL("/sitemap.xml", siteOrigin()).href,
  };
}
