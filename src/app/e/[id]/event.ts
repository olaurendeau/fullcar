import type { Kysely } from "kysely";
import { findEventById, type PublicEvent } from "@/db/events";
import type { Database } from "@/db/schema";
import type { EventHeader } from "@/domain/event";
import { isPublicId } from "@/domain/public-id";

/**
 * The event behind `/e/{id}`; nothing for an unknown id. A malformed id is never looked
 * up (C6.2): it reaches the same 404 as an unknown one, without reading the database.
 */
export async function findPublicEvent(db: Kysely<Database>, id: string): Promise<PublicEvent | undefined> {
  if (!isPublicId(id)) return undefined;
  return findEventById(db, id);
}

/** The header of the row read: the database keeps both coordinates or neither. */
export function headerFrom(row: PublicEvent): EventHeader {
  const { location_lat: lat, location_lng: lng } = row;
  const locationPosition = lat === null || lng === null ? null : { lat, lng };
  return {
    title: row.title,
    location: row.location,
    locationPosition,
    allerAt: row.aller_at,
    retourAt: row.retour_at,
    description: row.description,
  };
}
