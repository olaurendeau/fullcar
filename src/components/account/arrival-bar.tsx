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

/** How long the page the link leads to has to show its title before the focus gives up on it. */
const TITLE_WAIT_MS = 5_000;

/**
 * Puts the focus on the title of the page a link has just led to (OA5.2, « Le focus »): the
 * `h1` that takes the focus (`tabindex="-1"`). A page that reads before it shows it (the admin's) is waited for.
 * Returns what stops the wait.
 */
function focusTitle(): () => void {
  const find = () => document.querySelector<HTMLElement>('main h1[tabindex="-1"]');
  const found = find();
  if (found) {
    found.focus();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    const title = find();
    if (!title) return;
    observer.disconnect();
    title.focus();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const giveUp = setTimeout(() => observer.disconnect(), TITLE_WAIT_MS);
  return () => {
    observer.disconnect();
    clearTimeout(giveUp);
  };
}

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

  useEffect(
    () =>
      onArrival(() => {
        const token = readSessionToken();
        focusPending.current = true;
        setEmail(undefined);
        if (token === undefined) return;
        void sendAction(() => signedInAs(token)).then((sent) => {
          const answer = sent.ok ? (sent.value as { email?: unknown } | null) : null;
          if (typeof answer?.email === "string") setEmail(answer.email);
        });
      }),
    [],
  );

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
