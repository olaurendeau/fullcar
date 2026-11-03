"use client";

import { CircleCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { signedInAs } from "@/app/connexion/actions";
import { onArrival } from "@/app/connexion/arrival";
import { sendAction } from "@/app/e/[id]/run-action";
import { readSessionToken } from "@/app/session-token";
import { Button } from "@/components/ui/button";
import { emailIfCurrent } from "./email-if-current";
import { focusTitle } from "./focus-title";

/**
 * « Session ouverte avec {email}. » (OA5.2, OA5.9), in the bar at the bottom of the page a link
 * leads to, mounted once by the root layout so that it stays across the navigation. The link's page
 * tells it (arrival.ts) that a session has just opened; it asks whose with the token the browser
 * has just kept, in the body (`signedInAs`): a failure says nothing, and the bar is left out.
 * Once the page has changed, the focus goes to its title. « Fermer » closes it.
 */
export function ArrivalBar() {
  const t = useTranslations("Session");
  const tActions = useTranslations("Actions");
  const pathname = usePathname();
  const [email, setEmail] = useState<string>();
  // Set by the arrival, taken by the first page that is not a link's: its title takes the focus.
  const focusPending = useRef(false);
  // The session token the bar's email was asked with: the bar speaks of that session only.
  const shownFor = useRef<string>(undefined);

  useEffect(
    () =>
      onArrival(() => {
        const token = readSessionToken();
        focusPending.current = true;
        shownFor.current = token;
        setEmail(undefined);
        if (token === undefined) return;
        void emailIfCurrent(
          () => sendAction(() => signedInAs(token)),
          () => shownFor.current === token,
        ).then((address) => {
          if (address !== undefined) setEmail(address);
        });
      }),
    [],
  );

  // Once the session it speaks of is gone from the browser (« Se déconnecter », « Supprimer mon compte »),
  // the bar goes with it: no « Session ouverte avec … » under « Session fermée. », nor on `/` after the deletion.
  useEffect(() => {
    if (shownFor.current !== undefined && readSessionToken() !== shownFor.current) {
      shownFor.current = undefined;
      setEmail(undefined);
    }
  }, [pathname]);

  useEffect(() => {
    if (!focusPending.current || pathname.startsWith("/connexion/")) return;
    focusPending.current = false;
    return focusTitle();
  }, [pathname]);

  return (
    // In place before it speaks, as a live region must be to be announced.
    <div role="status" className="contents">
      {email !== undefined && (
        <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-transparent bg-inverse py-1 pr-1 pl-4 text-sm font-medium text-inverse-foreground shadow-lg">
          <p className="flex min-w-0 flex-1 gap-2.5 py-2.5 wrap-anywhere">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{t("signedInAs", { email })}</span>
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 hover:bg-inverse-foreground/15 hover:text-inverse-foreground focus-visible:outline-offset-0"
            aria-label={tActions("close")}
            onClick={() => setEmail(undefined)}
          >
            <X aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
