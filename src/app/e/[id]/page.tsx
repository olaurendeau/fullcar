import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactFooter } from "@/components/contact/contact-footer";
import { eventMetadata, loadEvent, loadPublicState } from "./load-event";
import { ParticipantBoard } from "./participant-board";

// No loading.tsx under /e/[id]: the page waits for its read, so a 404 is a real 404.

export async function generateMetadata({ params }: PageProps<"/e/[id]">): Promise<Metadata> {
  return eventMetadata((await params).id);
}

/** `/e/{id}`: the event as anyone holding its link sees it (#3, R5). */
export default async function EventPage({ params }: PageProps<"/e/[id]">) {
  const { id } = await params;
  const [event, board] = await Promise.all([loadEvent(id), loadPublicState(id)]);
  if (!event || !board) notFound();

  // While the bar of messages shows, 112 px more below: nothing stays under it (C11.4).
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4 has-data-[message-bar=open]:pb-[calc(1rem+112px+env(safe-area-inset-bottom))]">
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
