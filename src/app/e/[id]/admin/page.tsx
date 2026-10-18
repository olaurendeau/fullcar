import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  const [event, board] = await Promise.all([loadEvent(id), loadPublicState(id)]);
  if (!event || !board) notFound();

  // While the bar of messages shows, 112 px more below: nothing stays under it (C11.4).
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4 has-data-[message-bar=open]:pb-[calc(1rem+112px+env(safe-area-inset-bottom))]">
      <AdminArrival id={event.id} />
      <ParticipantBoard
        id={event.id}
        title={event.title}
        location={event.location}
        allerAt={event.aller_at}
        retourAt={event.retour_at}
        board={board}
      />
      <ContactFooter />
    </main>
  );
}
