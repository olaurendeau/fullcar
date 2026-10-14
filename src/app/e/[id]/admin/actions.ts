"use server";

import { getDb } from "@/db/client";
import { readAdminTokenHash } from "@/db/events";
import { databaseFailure } from "@/db/failure";
import { adminTokenMatches } from "@/domain/admin-token";
import { isPublicId } from "@/domain/public-id";

/**
 * Whether `token` is the organiser's token of event `id` (C4.9, C8.4). The client reads
 * the token from the URL's fragment and sends it here, in the request's body.
 * A malformed id is refused without reading the database; a token that is not a string
 * is refused by the comparison. Never logs the token, never puts it in an error.
 */
export async function checkAdminLink(id: unknown, token: unknown): Promise<boolean> {
  if (!isPublicId(id)) return false;
  let storedHash: string | undefined;
  try {
    storedHash = await readAdminTokenHash(getDb(), id);
  } catch (error) {
    // Only its code is logged: no other detail of a Postgres error leaves the server.
    throw databaseFailure("checkAdminLink: the event could not be read", error);
  }
  return adminTokenMatches(token, storedHash);
}
