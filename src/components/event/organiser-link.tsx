"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { organiserLink } from "@/app/e/[id]/actions";
import { organiserProof } from "@/app/e/[id]/admin/admin-token-store";
import { sendAction } from "@/app/e/[id]/run-action";
import { Button } from "@/components/ui/button";

/**
 * « Espace organisateur » above the header of `/e/{id}` (OA7.4), for the organiser's session and
 * for the browser that keeps the event's admin token; nobody else sees it. The page is the same
 * for every visitor: what this browser keeps is asked after the load, in the request's body, and
 * only when it keeps something. A failed ask shows no link: it is a shortcut, never the way in.
 */
export function OrganiserLink({ id }: { id: string }) {
  const t = useTranslations("Event");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const proof = organiserProof(id);
    if (Object.keys(proof).length === 0) return;
    let current = true;
    void sendAction(() => organiserLink(id, proof)).then((sent) => {
      if (current && sent.ok && sent.value === true) setShown(true);
    });
    return () => {
      current = false;
    };
  }, [id]);

  if (!shown) return null;
  return (
    <Button asChild variant="outline" className="mb-4 h-11 w-full">
      <Link href={`/e/${id}/admin`} prefetch={false}>
        <Lock aria-hidden />
        {t("organiserSpace")}
      </Link>
    </Button>
  );
}
