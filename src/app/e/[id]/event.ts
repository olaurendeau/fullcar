import type { Kysely } from "kysely";
import { findEventById, type PublicEvent } from "@/db/events";
import type { Database } from "@/db/schema";
import { isPublicId } from "@/domain/public-id";

/**
 * The event behind `/e/{id}`; nothing for an unknown id. A malformed id is never looked
 * up (C6.2): it reaches the same 404 as an unknown one, without reading the database.
 */
export async function findPublicEvent(db: Kysely<Database>, id: string): Promise<PublicEvent | undefined> {
  if (!isPublicId(id)) return undefined;
  return findEventById(db, id);
}
