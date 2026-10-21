import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ContactFooter } from "@/components/contact/contact-footer";
import { eventMetadata, loadPublicState } from "../load-event";
import { OrganiserScreen } from "./organiser-screen";

// No loading.tsx here either: an unknown id answers a real 404 (C6.4).

export async function generateMetadata({ params }: PageProps<"/e/[id]/admin">): Promise<Metadata> {
  return eventMetadata((await params).id);
}

/**
 * `/e/{id}/admin#{token}`: the organiser's panel, then the event as its participants see
 * it (#3, R4). The server never sees the token: the fragment is not sent, the page is the
 * same for every visitor, and the client checks the token through the action.
 */
export default async function AdminPage({ params }: PageProps<"/e/[id]/admin">) {
  const { id } = await params;
  // The header comes with the legs, from one snapshot (epic #250).
  const [state, t] = await Promise.all([loadPublicState(id), getTranslations("Admin")]);
  if (!state) notFound();

  // The page's whole width, for the panel's 1024 px (O7.5); the rest keeps the column of
  // /e/{id}, centred. While the bar of messages shows, 112 px more below: nothing stays under it (C11.4).
  // No scroll anchoring, here and on <body> (`data-scroll-anchor`, layout.tsx): the screen keeps the
  // board in place itself, as Safari iOS needs, and the browsers that anchor would move it a second time (O1.11).
  return (
    <main
      data-scroll-anchor="none"
      className="flex w-full flex-1 flex-col gap-6 p-4 [overflow-anchor:none] has-data-[message-bar=open]:pb-[calc(1rem+112px+env(safe-area-inset-bottom))]"
    >
      {/* Without JavaScript, the token cannot be checked: the panel's place says so (O5.5). */}
      <noscript>
        <p
          role="note"
          className="mx-auto grid w-full max-w-board grid-cols-[1rem_1fr] gap-x-2.5 rounded-lg border p-3 text-sm font-semibold"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4" />
          {t("needsJavaScript")}
        </p>
      </noscript>
      <OrganiserScreen id={id} state={state}>
        <ContactFooter />
      </OrganiserScreen>
    </main>
  );
}
