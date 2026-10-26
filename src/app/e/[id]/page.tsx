import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactFooter } from "@/components/contact/contact-footer";
import { EventEnded } from "@/components/event/event-ended";
import { eventMetadata, loadEventPage } from "./load-event";
import { ParticipantBoard } from "./participant-board";

// No loading.tsx under /e/[id]: the page waits for its read, so a 404 is a real 404.

export async function generateMetadata({ params }: PageProps<"/e/[id]">): Promise<Metadata> {
  return eventMetadata((await params).id);
}

/**
 * `/e/{id}`: the event as anyone holding its link sees it (#3, R5). Anonymised, « Événement
 * terminé », answered 200 in noindex, like any page under /e (OA8.3, #590).
 */
export default async function EventPage({ params }: PageProps<"/e/[id]">) {
  const { id } = await params;
  // The header comes with the legs, from one snapshot (epic #250).
  const page = await loadEventPage(id);
  if (!page) notFound();
  if (page.ended) return <EventEnded title={page.title} allerAt={page.allerAt} />;
  const { state } = page;

  // While the bar of messages shows, room below for it as measured, and its 12 px: nothing stays under it (C11.4).
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-4 has-data-[message-bar=open]:pb-[calc(1rem+var(--message-bar-height,0px)+12px+env(safe-area-inset-bottom))]">
      <ParticipantBoard id={id} state={state} />
      <ContactFooter />
    </main>
  );
}
