import Link from "next/link";
import { useTranslations } from "next-intl";
import { LanguageSwitch } from "@/components/i18n/language-switch";

/**
 * The chat Crisp hosts, on Crisp's own page (#64, #69): nothing of Crisp runs in the app's
 * origin, where its script could read what the browser keeps for the app. The website id is
 * public, it is in every page that embeds Crisp.
 */
export const CRISP_CHAT_URL = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";

/** The public repository of Fullcar (#489): a fixed address, nothing of the page taken along. */
export const SOURCE_CODE_URL = "https://github.com/olaurendeau/fullcar";

/** A link of the page's last lines: 14 px, grey, 44 px tall at least, as wide as its text. */
export const inLink =
  "inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground underline underline-offset-4 focus-visible:focus-ring";

const outLink = "inline-flex min-h-11 items-center px-3 text-sm text-muted-foreground underline underline-offset-4";

/**
 * The last thing of a page, on two lines at every width (#489, design github-link).
 *
 * Line 1, what stays in the app: a link to the home page (#232, A3), in the same tab, at the
 * fixed address `/`, then the language switch (#113), then a link to the privacy page (#612,
 * OA10.3), in the same tab too, at the fixed address `/confidentialite`. The home link takes
 * nothing of the current address along, is left out of `/` itself (`withHomeLink={false}`),
 * where it would lead nowhere, and is not prefetched: no page, the organiser's included, asks
 * for the home page before a tap on it. The privacy link is not prefetched either, and is on
 * every page, `/` included.
 *
 * Line 2, what leaves it: the source code on GitHub, then a discreet "contact us" link (#69,
 * K1 to K3), the last link of the page. Both open a new tab, with neither opener nor
 * referrer: the page they open can reach back to the organiser's page, its fragment
 * included, through none of them (K4, G7). Nothing is asked of GitHub before a tap (G8).
 */
export function ContactFooter({ withHomeLink = true }: { withHomeLink?: boolean }) {
  const t = useTranslations("Contact");

  return (
    <footer className="flex flex-col items-center gap-1 pt-6">
      <LanguageSwitch
        before={
          withHomeLink && (
            <Link href="/" prefetch={false} className={inLink}>
              {t("home")}
            </Link>
          )
        }
        after={
          <Link href="/confidentialite" prefetch={false} className={inLink}>
            {t("privacy")}
          </Link>
        }
      />
      <div className="flex flex-wrap justify-center">
        <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer" className={outLink}>
          {t("sourceCode")}
          <span className="sr-only"> {t("newTab")}</span>
        </a>
        <a href={CRISP_CHAT_URL} target="_blank" rel="noopener noreferrer" className={outLink}>
          {t("link")}
          <span className="sr-only"> {t("newTab")}</span>
        </a>
      </div>
    </footer>
  );
}
