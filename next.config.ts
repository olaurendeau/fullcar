import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Every page is per-request and personal (tokens, placements): nothing to cache.
// Cache Components stays off until a page has something worth caching.
const nextConfig: NextConfig = {
  logging: {
    // `next dev` prints each Server Function call with its arguments: a token is one.
    serverFunctions: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Event ids travel in URLs; tokens never do, but a leaked event id is still a leak.
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        // An event's link gives access: never indexed, even were the page's robots meta lost (#412).
        source: "/e/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

/*
 * Sentry only when a DSN is set at build time (#234): without one, the SDK's build plugin is
 * not even imported, and the configuration stays the one above. The browser talks to our
 * origin only (`/monitoring`, rewritten to Sentry's ingest). Source maps are made, uploaded
 * and deleted only with `SENTRY_AUTH_TOKEN`; without it, none is made and the build passes.
 */
export default async function config(): Promise<NextConfig> {
  const withIntl = withNextIntl(nextConfig);
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return withIntl;
  const { withSentryConfig } = await import("@sentry/nextjs/config");
  return withSentryConfig(withIntl, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    tunnelRoute: "/monitoring",
    telemetry: false,
    silent: true,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
    webpack: {
      automaticVercelMonitors: false,
      autoInstrumentServerFunctions: false,
      autoInstrumentMiddleware: false,
      autoInstrumentAppDirectory: false,
    },
  });
}
