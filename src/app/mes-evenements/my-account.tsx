"use client";

import { LogOut, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { noteSignedOut } from "@/app/connexion/signed-out";
import { sendAction } from "@/app/e/[id]/run-action";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";
import { signOutBrowser } from "./sign-out-browser";

/**
 * « Mon compte », at the bottom of Mes événements (OA9.1): the session's address and « Se
 * déconnecter », without a confirmation. Signed out, the page leads to /connexion, which says
 * « Session fermée. ». A failure says `Account.signOutFailed` in the bar, the session open
 * (OA9.2); « Fermer » takes the bar away and gives the focus back to the button.
 */
export function MyAccount({ email }: { email: string }) {
  const t = useTranslations("Account");
  const tActions = useTranslations("Actions");
  const router = useRouter();
  const ids = useId();
  const [sending, setSending] = useState(false);
  // How many sign-outs failed in a row: each new failure is a new alert, announced again.
  const [failures, setFailures] = useState(0);
  // Set at once, unlike `sending`: a second tap before the next render sends nothing.
  const inFlight = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  async function signOutHere() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const run = await signOutBrowser((session, adminTokens) => sendAction(() => signOut(session, adminTokens)));
    if (run === "signedOut") {
      noteSignedOut();
      router.push("/connexion");
      return;
    }
    inFlight.current = false;
    setSending(false);
    setFailures((count) => count + 1);
  }

  return (
    <>
      <section aria-labelledby={`${ids}-title`} className="flex min-w-0 flex-col gap-2 border-t pt-4">
        <h2 id={`${ids}-title`} className="font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted-foreground [overflow-wrap:anywhere]">{email}</p>
        <Button
          ref={button}
          type="button"
          variant="outline"
          className="h-11 w-full"
          aria-disabled={sending || undefined}
          onClick={() => void signOutHere()}
        >
          <LogOut aria-hidden />
          {t("signOut")}
        </Button>
      </section>
      {failures > 0 && (
        <>
          {/* Room below the page for the bar, which is out of its flow. */}
          <div aria-hidden className="h-20 shrink-0" />
          <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-destructive bg-background py-1 pr-1 pl-4 text-sm text-foreground shadow-lg">
            <TriangleAlert aria-hidden className="mt-3.5 size-4 shrink-0 text-destructive" />
            <p key={failures} role="alert" className="min-w-0 flex-1 py-2.5">
              {t("signOutFailed")}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 focus-visible:outline-offset-0"
              aria-label={tActions("close")}
              onClick={() => {
                setFailures(0);
                button.current?.focus();
              }}
            >
              <X aria-hidden />
            </Button>
          </div>
        </>
      )}
    </>
  );
}
