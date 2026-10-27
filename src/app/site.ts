import type { Metadata } from "next";

/**
 * The site's origin, for the sitemap, robots.txt and the canonical URLs (#412). On Vercel, the
 * production domain Vercel sets on every deployment (`VERCEL_PROJECT_PRODUCTION_URL`, the one
 * Next.js itself takes for production): never a preview's nor a commit's URL. Elsewhere, where
 * `next start` listens, as Next.js falls back to.
 */
export function siteOrigin(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const domain = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return domain ? `https://${domain}` : `http://localhost:${env.PORT?.trim() || 3000}`;
}

/** The pages a search engine may list (#412). An event's are reached by their link only. */
export const publicPaths = ["/", "/nouveau", "/confidentialite"] as const;
export type PublicPath = (typeof publicPaths)[number];

/** A public page's own metadata: its canonical URL, against the root layout's `metadataBase`. */
export function publicPageMetadata(path: PublicPath): Metadata {
  return { alternates: { canonical: path } };
}
