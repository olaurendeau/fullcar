import type { Metadata } from "next";

/** An event is reached by its link, never by a search engine (#3, C5.7). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EventLayout({ children }: LayoutProps<"/e">) {
  return children;
}
