import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { EventView } from "@/components/event/event-view";
import { getDb } from "@/db/client";
import { findPublicEvent } from "./event";

// No loading.tsx under /e/[id]: the page waits for its read, so a 404 is a real 404.

/** Read once per request, for the metadata and for the page. */
const loadEvent = cache((id: string) => findPublicEvent(getDb(), id));

export async function generateMetadata({ params }: PageProps<"/e/[id]">): Promise<Metadata> {
  const event = await loadEvent((await params).id);
  if (!event) return { title: (await getTranslations("EventNotFound"))("title") };
  return { title: event.title };
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
    </main>
  );
}
