import { useTranslations } from "next-intl";

/**
 * The chat Crisp hosts, on Crisp's own page (#64, #69): nothing of Crisp runs in the app's
 * origin, where its script could read what the browser keeps for the app. The website id is
 * public, it is in every page that embeds Crisp.
 */
export const CRISP_CHAT_URL = "https://go.crisp.chat/chat/embed/?website_id=3c4a7eb6-cf0d-4f60-a3c2-7919ae98ac83";

/**
 * The last thing of a page: a discreet "contact us" link (#69, K1 to K3). A new tab, with
 * neither opener nor referrer: Crisp's page can reach back to the organiser's page, its
 * fragment included, through none of them (K4).
 */
export function ContactFooter() {
  const t = useTranslations("Contact");

  return (
    <footer className="flex justify-center pt-6">
      <a
        href={CRISP_CHAT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center px-3 text-sm text-muted-foreground underline underline-offset-4"
      >
        {t("link")}
        <span className="sr-only"> {t("newTab")}</span>
      </a>
    </footer>
  );
}
