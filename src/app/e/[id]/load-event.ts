import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { getDb } from "@/db/client";
import { findPublicEvent } from "./event";

/** The event behind `/e/{id}` and `/e/{id}/admin`, read once per request for the metadata and the page. */
export const loadEvent = cache((id: string) => findPublicEvent(getDb(), id));

/** The document's title: the event's (C5.6), or the 404's. */
export async function eventMetadata(id: string): Promise<Metadata> {
  const event = await loadEvent(id);
  if (!event) return { title: (await getTranslations("EventNotFound"))("title") };
  return { title: event.title };
}
