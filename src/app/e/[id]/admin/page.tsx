import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventView } from "@/components/event/event-view";
import { eventMetadata, loadEvent } from "../load-event";
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
  const event = await loadEvent((await params).id);
  if (!event) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <AdminArrival id={event.id} />
      <EventView
        title={event.title}
        location={event.location}
        allerAt={event.aller_at}
        retourAt={event.retour_at}
      />
    </main>
  );
}
