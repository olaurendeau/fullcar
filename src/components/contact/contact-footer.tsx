import Link from "next/link";
import { useTranslations } from "next-intl";
import { LanguageSwitch } from "@/components/i18n/language-switch";

/**
 * The chat Crisp hosts, on Crisp's own page (#64, #69): nothing of Crisp runs in the app's
 * origin, where its script could read what the browser keeps for the app. The website id is
 * public, it is in every page that embeds Crisp.
 */
export const CRISP_CHAT_URL = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";

/**
 * The last thing of a page: the language switch (#113), then a discreet "contact us" link
 * (#69, K1 to K3), the last link of the page. A new tab, with neither opener nor referrer:
 * Crisp's page can reach back to the organiser's page, its fragment included, through none
 * of them (K4).
 *
 * First of the row, a link to the home page (#232, A3), in the same tab, at the fixed address
 * `/`: it takes nothing of the current address along. Left out of `/` itself
 * (`withHomeLink={false}`), where it would lead nowhere. Not prefetched: no page, the
 * organiser's included, asks for the home page before a tap on it.
 */
export function ContactFooter({ withHomeLink = true }: { withHomeLink?: boolean }) {
  const t = useTranslations("Contact");

  return (
    <footer className="flex flex-col items-center gap-1 pt-6">
      <LanguageSwitch
        before={
          withHomeLink && (
            <Link
              href="/"
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground underline underline-offset-4 focus-visible:focus-ring"
            >
              {t("home")}
            </Link>
          )
        }
      >
        <a
          href={CRISP_CHAT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center px-3 text-sm text-muted-foreground underline underline-offset-4"
        >
          {t("link")}
          <span className="sr-only"> {t("newTab")}</span>
        </a>
      </LanguageSwitch>
    </footer>
  );
}
