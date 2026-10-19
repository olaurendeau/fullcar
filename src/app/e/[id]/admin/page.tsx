import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ContactFooter } from "@/components/contact/contact-footer";
import { eventMetadata, loadEvent, loadPublicState } from "../load-event";
import { ParticipantBoard } from "../participant-board";
import { AdminArrival } from "./admin-arrival";

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
  const [event, board, t] = await Promise.all([loadEvent(id), loadPublicState(id), getTranslations("Admin")]);
  if (!event || !board) notFound();

  // The page's whole width, for the panel's 1024 px (O7.5); the rest keeps the column of
  // /e/{id}, centred. While the bar of messages shows, 112 px more below: nothing stays under it (C11.4).
  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-4 has-data-[message-bar=open]:pb-[calc(1rem+112px+env(safe-area-inset-bottom))]">
      <AdminArrival id={event.id} allerAt={event.aller_at} retourAt={event.retour_at} />
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
      <div className="mx-auto flex w-full max-w-board flex-col gap-6">
        <ParticipantBoard
          id={event.id}
          title={event.title}
          location={event.location}
          allerAt={event.aller_at}
          retourAt={event.retour_at}
          board={board}
        />
        <ContactFooter />
      </div>
    </main>
  );
}
