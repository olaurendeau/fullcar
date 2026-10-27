"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { organiserProof } from "@/app/e/[id]/admin/admin-token-store";
import { Button } from "@/components/ui/button";

const noSubscription = () => () => {};

/**
 * « Espace organisateur » on `/e/{id}` (OA7.4), for the browser that keeps this event's admin
 * token, or a session. The page is the same for every visitor and nothing is sent: what the
 * browser keeps is only read, once hydrated. It is a shortcut, never the way in: the area decides
 * on arrival whether this browser may enter (the token goes to `/e/{id}/admin` only, O6.1).
 *
 * It comes after the board, so that its 44 px push nothing that was drawn: the page does not
 * jump when the link appears (CA1.19, DS2.9).
 */
export function OrganiserLink({ id }: { id: string }) {
  const t = useTranslations("Event");
  // Nothing on the server and on the first render, what the browser keeps once hydrated.
  const shown = useSyncExternalStore(
    noSubscription,
    () => Object.keys(organiserProof(id)).length > 0,
    () => false,
  );

  if (!shown) return null;
  return (
    <Button asChild variant="outline" className="mt-4 h-11 w-full">
      <Link href={`/e/${id}/admin`} prefetch={false}>
        <Lock aria-hidden />
        {t("organiserSpace")}
      </Link>
    </Button>
  );
}
