"use client";

import { useTranslations } from "next-intl";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useEffect, useRef } from "react";
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
 * While the removal is sent, « Supprimer le retour » is `aria-disabled` and keeps the focus, a
 * second tap sends nothing, and neither « Annuler » nor Escape closes anything: the answer comes
 * here. Then the focus goes back to « Supprimer le retour », or to « Annuler » once the event is
 * gone, which leaves the removal `disabled`. Closed, `onClosed` says where the focus goes.
 */
export function RemoveRetourDialog({
  open,
  counts,
  said,
  sending,
  onConfirm,
  onCancel,
  onClosed,
}: {
  open: boolean;
  counts: RetourCounts;
  said: RemovalSaid | null;
  sending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const t = useTranslations();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const gone = said === "eventNotFound";

  useEffect(() => {
    if (!open || sending || said === null) return;
    (gone ? cancelButton : confirmButton).current?.focus();
  }, [open, sending, said, gone]);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !sending && onCancel()}>
      <AlertDialogContent
        onEscapeKeyDown={(escape) => sending && escape.preventDefault()}
        onCloseAutoFocus={(focus) => {
          focus.preventDefault();
          onClosed();
        }}
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
            ref={cancelButton}
            className="h-11 w-full"
            aria-disabled={sending || undefined}
            onClick={(press) => sending && press.preventDefault()}
          >
            {t("Actions.cancel")}
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
