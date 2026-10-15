import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactFooter } from "@/components/contact/contact-footer";
import { EventView } from "@/components/event/event-view";
import { eventMetadata, loadEvent } from "./load-event";

// No loading.tsx under /e/[id]: the page waits for its read, so a 404 is a real 404.

export async function generateMetadata({ params }: PageProps<"/e/[id]">): Promise<Metadata> {
  return eventMetadata((await params).id);
}

/** `/e/{id}`: the event as anyone holding its link sees it (#3, R5). */
export default async function EventPage({ params }: PageProps<"/e/[id]">) {
  const event = await loadEvent((await params).id);
  if (!event) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
      <EventView
        title={event.title}
        location={event.location}
        allerAt={event.aller_at}
        retourAt={event.retour_at}
      />
      <ContactFooter />
    </main>
  );
}
