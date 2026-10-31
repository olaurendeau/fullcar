"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { useRef, useState } from "react";
import { noteAccountDeleted } from "@/app/account-deleted";
import { noteSignedOut } from "@/app/connexion/signed-out";
import { sendAction } from "@/app/e/[id]/run-action";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteAccount } from "./actions";
import { deleteAccountBrowser } from "./delete-account-browser";

/**
 * « Supprimer mon compte » and its confirmation (OA9.3 to OA9.5): what is erased, what becomes
 * of the `openEvents` (only if there are some), and that it is final. The focus starts on
 * « Annuler »; it and Escape change nothing. Deleted, the page leads to `/`, which says so once.
 * A failure says `DeleteAccount.failed` in the confirmation, which stays open (OA9.4); a session
 * already closed, or an account already gone, leads to /connexion instead: no retry could succeed. While it
 * is sent, a second tap sends nothing, and neither « Annuler » nor Escape closes it.
 */
export function DeleteAccountDialog({ openEvents }: { openEvents: number }) {
  const t = useTranslations("DeleteAccount");
  const tAccount = useTranslations("Account");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [failures, setFailures] = useState(0);
  // Set at once, unlike `sending`: a second tap before the next render sends nothing.
  const inFlight = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  function change(next: boolean) {
    if (!next && inFlight.current) return;
    setOpen(next);
    if (next) setFailures(0);
  }

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const run = await deleteAccountBrowser((session, adminTokens) => sendAction(() => deleteAccount(session, adminTokens)));
    if (run === "deleted") {
      noteAccountDeleted();
      router.push("/");
      return;
    }
    if (run === "gone") {
      // The session is closed, ended, or its account gone: « Session fermée. » on /connexion, as after « Se déconnecter ».
      noteSignedOut();
      router.push("/connexion");
      return;
    }
    inFlight.current = false;
    setSending(false);
    setFailures((count) => count + 1);
    confirmButton.current?.focus();
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className="h-11 w-full text-destructive hover:text-destructive">
          <Trash2 aria-hidden />
          {tAccount("delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onEscapeKeyDown={(escape) => inFlight.current && escape.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-1.5">
              <p>{t("erased")}</p>
              {openEvents > 0 && <p>{t("open", { count: openEvents })}</p>}
              <p>{t("final")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failures > 0 && (
          <p key={failures} role="alert" className="text-sm text-destructive">
            {t("failed")}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <AlertDialogPrimitive.Action asChild>
            <Button
              ref={confirmButton}
              aria-disabled={sending || undefined}
              className="h-11 w-full bg-destructive text-white hover:bg-destructive/90 aria-disabled:bg-muted aria-disabled:text-muted-foreground"
              onClick={(press) => {
                // Closed by the answer, not by the press.
                press.preventDefault();
                void confirm();
              }}
            >
              {t("confirm")}
            </Button>
          </AlertDialogPrimitive.Action>
          <AlertDialogCancel
            className="h-11 w-full"
            aria-disabled={sending || undefined}
            onClick={(press) => sending && press.preventDefault()}
          >
            {t("cancel")}
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
