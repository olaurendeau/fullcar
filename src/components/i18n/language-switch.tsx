"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { setLocale } from "@/app/actions";
import { defaultLocale, isLocale, otherLocale } from "@/i18n/locales";

const noSubscription = () => () => {};

/**
 * The footer's row (#113): a button that names the other language in that language, then
 * `children`, the contact link. A tap asks the server to remember the language; its answer
 * is the page already rendered in it, applied in place, without reloading the document.
 * Nothing else happens on the client: no refresh, no navigation, and nothing read from the URL.
 */
export function LanguageSwitch({ children }: { children: ReactNode }) {
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

  // Released once the page is in the new language, or once it failed. The button lost the
  // focus when it became inactive: it gets it back (L1.7).
  useEffect(() => {
    if (switching || !inFlight.current) return;
    inFlight.current = false;
    button.current?.focus();
  }, [switching]);

  function change() {
    if (inFlight.current) return;
    inFlight.current = true;
    startSwitching(async () => {
      try {
        await setLocale(next);
      } catch {
        // Offline, or the server failed: the page stays as it is, and the button comes back.
      }
    });
  }

  return (
    <div className="flex flex-wrap justify-center">
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
  );
}
