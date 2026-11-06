"use client";

import { useTranslations } from "next-intl";
import { useId, type RefObject } from "react";
import { Button } from "@/components/ui/button";

/**
 * « Céder l’événement » (epic #935, OT1.1): the last section of the organiser's panel, a title,
 * `Transfer.section.body` and « Choisir une adresse », which opens the sheet (`TransferSheet`). It
 * is there while no confirmation and no handover waits: the notice takes its place then.
 * `startRef` is the button, the focus's place once the sheet closes without a handover (OT8.5).
 */
export function TransferSection({ startRef, onStart }: { startRef: RefObject<HTMLButtonElement | null>; onStart: () => void }) {
  const t = useTranslations("Transfer");
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-2 border-t pt-4">
      <h3 id={titleId} className="font-semibold">
        {t("section.title")}
      </h3>
      <p className="max-w-prose text-sm text-muted-foreground">{t("section.body")}</p>
      <Button ref={startRef} type="button" variant="outline" className="h-11 w-full lg:w-fit lg:self-start" onClick={onStart}>
        {t("start")}
      </Button>
    </section>
  );
}
