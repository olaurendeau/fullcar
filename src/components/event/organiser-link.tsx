"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { organiserLink } from "@/app/e/[id]/actions";
import { readAdminToken } from "@/app/e/[id]/admin/admin-token-store";
import { sendAction } from "@/app/e/[id]/run-action";
import { readSessionToken } from "@/app/session-token";
import { Button } from "@/components/ui/button";

const noSubscription = () => () => {};

/**
 * « Espace organisateur » on `/e/{id}` (OA7.4), for the event's organiser and nobody else: the
 * browser that keeps this event's admin token, which it knows without a request, or the session
 * of the event's account, which the server says. The page is the same for every visitor and
 * what is shown comes after the load. Only the session's token is sent, in the request's body,
 * and only when the browser keeps one and no admin token: the admin token goes to `/e/{id}/admin`
 * only (O6.1). It is a shortcut, never the way in: the area decides on arrival, and a failed ask
 * shows no link.
 *
 * It comes after the board, so that its 44 px push nothing that was drawn: the page does not
 * jump when the link appears (CA1.19, DS2.9).
 */
export function OrganiserLink({ id }: { id: string }) {
  const t = useTranslations("Event");
  // Nothing on the server and on the first render, what the browser keeps once hydrated.
  const tokenKept = useSyncExternalStore(
    noSubscription,
    () => readAdminToken(id) !== undefined,
    () => false,
  );
  const [sessionOrganises, setSessionOrganises] = useState(false);

  useEffect(() => {
    const session = readSessionToken();
    // Read here, not from `tokenKept`, which is still false on the render that hydrates.
    if (session === undefined || readAdminToken(id) !== undefined) return;
    let current = true;
    void sendAction(() => organiserLink(id, session)).then((sent) => {
      if (current && sent.ok && sent.value === true) setSessionOrganises(true);
    });
    return () => {
      current = false;
    };
  }, [id]);

  if (!tokenKept && !sessionOrganises) return null;
  return (
    <Button asChild variant="outline" className="mt-4 h-11 w-full">
      <Link href={`/e/${id}/admin`} prefetch={false}>
        <Lock aria-hidden />
        {t("organiserSpace")}
      </Link>
    </Button>
  );
}
