"use client";

import { useTranslations } from "next-intl";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useEffect, useRef, type RefObject } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** What the retour holds, as the server counts it (`LegCounts`): its cars, and the persons on it. */
export interface RetourCounts {
  cars: number;
  persons: number;
}

/**
 * What the confirmation says of its last answer, above its buttons (« Supprimer le retour »,
 * « Les réponses, confirmation ouverte »): the retour changed meanwhile (M3.5), or why it was not
 * removed (M3.7).
 */
export type RemovalSaid = "changed" | "offline" | "failed" | "eventNotFound";

/**
 * « Supprimer le retour ? » (organizer-view v3.3.8, decision DE1 = b), over the sheet of
 * « Modifier l’événement », on the model of « Retirer la voiture »: what the removal takes,
 * `counts`, that the aller does not change, that nobody is notified, then the removal in red and
 * « Annuler ». The focus starts on « Annuler ».
 *
 * While the removal is sent, « Supprimer le retour » is `aria-disabled` and keeps the focus, and
 * a second tap sends nothing. For 10 s, neither « Annuler » nor Escape closes anything: the
 * answer comes here (decision 39); then, once `waited`, they close it, the answer going to the
 * sheet. After an answer, the focus goes back to « Supprimer le retour », or to « Annuler »
 * (`cancelRef`, which the sheet focuses before the removal is `disabled`, never by `<body>`) once
 * the event is gone. As it closes, the sheet gives the focus its place.
 */
export function RemoveRetourDialog({
  open,
  counts,
  said,
  sending,
  waited,
  cancelRef,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  counts: RetourCounts;
  said: RemovalSaid | null;
  sending: boolean;
  waited: boolean;
  cancelRef: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const gone = said === "eventNotFound";
  const held = sending && !waited;

  useEffect(() => {
    if (!open || sending || said === null) return;
    (gone ? cancelRef : confirmButton).current?.focus();
  }, [open, sending, said, gone, cancelRef]);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !held && onCancel()}>
      <AlertDialogContent
        onEscapeKeyDown={(escape) => held && escape.preventDefault()}
        // The sheet has given the focus its place as this closed, before it was gone.
        onCloseAutoFocus={(focus) => focus.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("EditEvent.removeRetour.title")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-1.5">
              <p>{t("EditEvent.removeRetour.body", { ...counts })}</p>
              <p>{t("EditEvent.removeRetour.aller")}</p>
              <p>{t("RideChanges.remove.notified")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {said && (
          <p role="alert" className="text-sm text-destructive">
            {said === "changed"
              ? t("EditEvent.removeRetour.changed")
              : t("Actions.failure", { notDone: t("Actions.notDone.removeRetour"), why: t(`Actions.why.${said}`) })}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <AlertDialogPrimitive.Action asChild>
            <Button
              ref={confirmButton}
              disabled={gone}
              aria-disabled={sending || undefined}
              className="h-11 w-full bg-destructive text-white hover:bg-destructive/90 aria-disabled:bg-muted aria-disabled:text-muted-foreground"
              onClick={(press) => {
                // Closed by the answer, not by the press.
                press.preventDefault();
                if (!sending) onConfirm();
              }}
            >
              {t("EditEvent.removeRetour.confirm")}
            </Button>
          </AlertDialogPrimitive.Action>
          <AlertDialogCancel
            ref={cancelRef}
            className="h-11 w-full"
            aria-disabled={held || undefined}
            onClick={(press) => held && press.preventDefault()}
          >
            {t("Actions.cancel")}
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
