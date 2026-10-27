import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import { CRISP_CHAT_URL, ContactFooter } from "@/components/contact/contact-footer";
import { publicPageMetadata } from "../site";
import { POLICY, type Role } from "./policy";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("Privacy"))("title"), ...publicPageMetadata("/confidentialite") };
}

/** Where a complaint to the French authority goes (privacy-policy, PP4). */
const CNIL_COMPLAINTS_URL = "https://www.cnil.fr/fr/plaintes";

const link =
  "inline-flex min-h-11 items-center rounded-lg text-primary underline underline-offset-4 focus-visible:focus-ring";

/**
 * `/confidentialite` (organizer-account OA10.4, privacy-policy PP1 to PP6): the owner's text,
 * a `max-w-md` column as `/nouveau` is, then the common footer. A stateless server component:
 * the same HTML for every visitor, and nothing is asked of another host before a tap on one
 * of its two links, which leave in a new tab with neither opener nor referrer.
 */
export default function PrivacyPage() {
  const t = useTranslations();

  const outLink = (href: string, key: string): ReactNode => (
    <p>
      <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
        {t(key)}
        <span className="sr-only"> {t("Contact.newTab")}</span>
      </a>
    </p>
  );

  const block = (key: string, role: Role): ReactNode => {
    switch (role) {
      case "h1":
        return <h1 className="text-2xl font-bold">{t(key)}</h1>;
      case "h2":
        return <h2 className="mt-4 text-lg font-semibold">{t(key)}</h2>;
      case "h3":
        return <h3 className="mt-1 font-semibold">{t(key)}</h3>;
      case "cnil":
        return outLink(CNIL_COMPLAINTS_URL, key);
      case "chat":
        return outLink(CRISP_CHAT_URL, key);
      default:
        return <p>{t(key)}</p>;
    }
  };

  // Items that follow one another form one list.
  const content: ReactNode[] = [];
  for (let at = 0; at < POLICY.length; at++) {
    const { key, role } = POLICY[at];
    if (role !== "li") {
      content.push(<Fragment key={key}>{block(key, role)}</Fragment>);
      continue;
    }
    const items: string[] = [];
    for (; at < POLICY.length && POLICY[at].role === "li"; at++) items.push(POLICY[at].key);
    at--;
    content.push(
      <ul key={items[0]} className="flex list-disc flex-col gap-1.5 pl-5">
        {items.map((item) => (
          <li key={item}>{t(item)}</li>
        ))}
      </ul>,
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 p-4 [overflow-wrap:anywhere]">
      {content}
      <ContactFooter />
    </main>
  );
}
