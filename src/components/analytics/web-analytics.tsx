"use client";

import { Analytics } from "@vercel/analytics/next";
import { analyticsBeforeSend } from "@/observability/analytics";

/**
 * Vercel Web Analytics (#346), on the production deployment only: nothing loads locally, in
 * the CI or on a preview. `NEXT_PUBLIC_VERCEL_ENV` is written out in full so that Next.js
 * inlines it at build time. Each page view goes through `analyticsBeforeSend`.
 */
export function WebAnalytics() {
  return process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? <Analytics beforeSend={analyticsBeforeSend} /> : null;
}
