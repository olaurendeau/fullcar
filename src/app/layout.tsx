import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";
import { WebAnalytics } from "@/components/analytics/web-analytics";
import { cn } from "@/lib/utils";
import { siteOrigin } from "./site";

export const metadata: Metadata = {
  title: "Fullcar",
  // What a canonical URL is resolved against (#412). No canonical here: a page names its own.
  metadataBase: new URL(siteOrigin()),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={await getLocale()} className={cn("h-full antialiased", "font-sans")}>
      {/* Chrome takes the page's scroll anchoring from <body>: a page turns it off by its main (O1.11). */}
      <body className="min-h-full flex flex-col has-data-[scroll-anchor=none]:[overflow-anchor:none]">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <WebAnalytics />
      </body>
    </html>
  );
}
