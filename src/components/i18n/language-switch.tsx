"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { setLocale } from "@/app/actions";
import { defaultLocale, isLocale, otherLocale } from "@/i18n/locales";

const noSubscription = () => () => {};

/** Why the language did not change: offline or the server failed, or no cookie can keep it (#129). */
type Problem = "failed" | "cookiesBlocked";

/**
 * The footer's row (#113): `before`, the home link (#232), then a button that names the
 * other language in that language, then `children`, the contact link. A tap asks the server
 * to remember the language; its answer is the page already rendered in it, applied in place,
 * without reloading the document.
 * Nothing else happens on the client: no refresh, no navigation, and nothing read from the URL.
 * When it does not work, a message above the row says why, in the language asked for (#129).
 */
export function LanguageSwitch({ before, children }: { before?: ReactNode; children: ReactNode }) {
  const t = useTranslations("LanguageSwitch");
  const locale = useLocale();
  const next = otherLocale(isLocale(locale) ? locale : defaultLocale);
  // Inactive until hydrated, in its place: the row does not move then (L4.3).
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [switching, startSwitching] = useTransition();
  // Set at once, unlike `switching`: a second tap before the next render sends nothing (L4.4).
  const inFlight = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  // `tap` numbers the message: a second failure for the same reason is a new node, which a
  // screen reader announces again, even when nothing renders between the two (L4.2).
  const [problem, setProblem] = useState<{ reason: Problem; tap: number } | null>(null);
  const taps = useRef(0);

  // Released once the page is in the new language, or once it failed. The button lost the
  // focus when it became inactive: it gets it back (L1.7).
  useEffect(() => {
    if (switching || !inFlight.current) return;
    inFlight.current = false;
    button.current?.focus();
  }, [switching]);

  function change() {
    if (inFlight.current) return;
    setProblem(null);
    const tap = ++taps.current;
    // Without cookies, the choice could not be kept: the server is not asked (L4.2).
    if (!navigator.cookieEnabled) {
      setProblem({ reason: "cookiesBlocked", tap });
      return;
    }
    inFlight.current = true;
    startSwitching(async () => {
      try {
        await setLocale(next);
      } catch {
        // Offline, or the server failed: the page stays as it is, the button comes back, and
        // the message says so (L4.1). Caught here, it never reaches React's error boundary.
        setProblem({ reason: "failed", tap });
      }
    });
  }

  return (
    <>
      {problem && (
        <p key={problem.tap} role="alert" lang={next} className="text-center text-sm text-destructive">
          {t(problem.reason)}
        </p>
      )}
      <div className="flex flex-wrap justify-center">
        {before}
        <button
          ref={button}
          type="button"
          lang={next}
          disabled={!hydrated || switching}
          onClick={change}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <Globe aria-hidden="true" className="size-[15px] shrink-0" />
          {t("label")}
        </button>
        {children}
      </div>
    </>
  );
}
