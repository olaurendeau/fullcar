import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { formatDate } from "@/i18n/format-date";
import type { Locale } from "@/i18n/locales";

/*
 * The four emails of epic #581, and no other (docs/design/organizer-account/README.md,
 * « Les e-mails », decision 22). Their words are the `Emails.*` keys, in the language of the
 * page that asked for them; the warning, in the account's.
 *
 * The input has no field for anything somebody typed: no title, no place, no first name
 * (OA3.2). A title would be anyone writing, in our name, to an address they chose. The only
 * values are ours: the site's origin, a token the server drew, a date it computed.
 *
 * No image, no remote resource, no tracking (OA3.3): every link is to the origin, and the
 * token travels after `#` only, never in a path or a query string (OA3.4).
 */

/** The site, `https://host` with no path: every link of an email starts with it, then `/`. */
type Origin = string;

export type EmailInput =
  /** On creating an event without a session: confirms the address. */
  | { kind: "confirmation"; locale: Locale; origin: Origin; token: string }
  /** A sign-in link, for an address with an account. */
  | { kind: "signIn"; locale: Locale; origin: Origin; token: string }
  /** A sign-in request for an address with no account: no token, a way to /nouveau. */
  | { kind: "noAccount"; locale: Locale; origin: Origin }
  /** 30 days before an inactive account is deleted: no token, a way to /connexion. */
  | { kind: "inactivityWarning"; locale: Locale; origin: Origin; deletesAt: Date };

export interface RenderedEmail {
  subject: string;
  /** The plain-text part: the same words as the HTML, the button between brackets. */
  text: string;
  html: string;
}

const MESSAGES = { fr, en } as const;

/** How the warning writes its date: « 12 mars 2029 », « 12 March 2029 », « 1er mai 2029 ». */
const DATE_LOCALES: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

/** The reference time zone of the epic: « passé » and the day 30 are Paris's too. */
const TIME_ZONE = "Europe/Paris";

/** A token is base64url: nothing in it can leave the fragment or the attribute. */
const TOKEN = /^[A-Za-z0-9_-]+$/;

type Block =
  | { type: "paragraph"; text: string }
  | { type: "button"; label: string; href: string }
  /** « If the button does not work… », then the link on its own line. */
  | { type: "fallback"; lead: string; url: string }
  | { type: "footer"; text: string };

export function renderEmail(input: EmailInput): RenderedEmail {
  const origin = checkedOrigin(input.origin);
  const t = createTranslator({ locale: input.locale, messages: MESSAGES[input.locale], namespace: "Emails" });
  const hello: Block = { type: "paragraph", text: t("hello") };
  const footer: Block = { type: "footer", text: t("footer", { url: `${origin}/confidentialite` }) };

  let subject: string;
  let blocks: Block[];
  switch (input.kind) {
    case "confirmation":
    case "signIn": {
      const kind = input.kind;
      const url = `${origin}${kind === "confirmation" ? "/connexion/confirmer" : "/connexion/lien"}#${checkedToken(input.token)}`;
      subject = t(`${kind}.subject`);
      blocks = [
        hello,
        { type: "paragraph", text: t(`${kind}.intro`) },
        { type: "button", label: t(`${kind}.button`), href: url },
        { type: "paragraph", text: t(`${kind}.validity`) },
        { type: "paragraph", text: t(`${kind}.notYou`) },
        { type: "fallback", lead: t("fallback"), url },
      ];
      break;
    }
    case "noAccount": {
      const url = `${origin}/nouveau`;
      subject = t("noAccount.subject");
      blocks = [
        hello,
        { type: "paragraph", text: t("noAccount.intro") },
        { type: "button", label: t("noAccount.button"), href: url },
        { type: "paragraph", text: t("noAccount.notYou") },
        { type: "paragraph", text: t("noAccount.leadsTo", { url }) },
      ];
      break;
    }
    case "inactivityWarning": {
      const url = `${origin}/connexion`;
      const date = formatDate(DATE_LOCALES[input.locale], input.deletesAt, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: TIME_ZONE,
      });
      subject = t("inactivityWarning.subject", { date });
      blocks = [
        hello,
        { type: "paragraph", text: t("inactivityWarning.intro", { date }) },
        { type: "paragraph", text: t("inactivityWarning.keep") },
        { type: "button", label: t("inactivityWarning.button"), href: url },
        { type: "paragraph", text: t("inactivityWarning.nothingToDo") },
        { type: "paragraph", text: t("inactivityWarning.leadsTo", { url }) },
      ];
      break;
    }
  }
  blocks.push(footer);

  return { subject, text: textOf(blocks), html: htmlOf(input.locale, subject, blocks) };
}

function checkedOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("email: the origin is not a URL");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin !== origin) {
    throw new Error("email: the origin must be scheme://host, with nothing after");
  }
  return origin;
}

function checkedToken(token: string): string {
  // Never the token itself in the message: errors end up in logs.
  if (!TOKEN.test(token)) throw new Error("email: the token is not base64url");
  return token;
}

function textOf(blocks: readonly Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "footer":
          return block.text;
        case "button":
          return `[${block.label}]`;
        case "fallback":
          return `${block.lead}\n${block.url}`;
      }
    })
    .join("\n\n");
}

const STYLE = {
  body: "margin:0;padding:24px 16px;background-color:rgb(255,255,255);color:rgb(23,23,23);font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;",
  column: "max-width:520px;margin:0 auto;overflow-wrap:anywhere;word-break:break-word;",
  paragraph: "margin:0 0 16px;",
  button:
    "display:inline-block;padding:12px 20px;border-radius:8px;background-color:rgb(23,23,23);color:rgb(255,255,255);font-weight:600;text-decoration:none;",
  footer: "margin:24px 0 0;padding-top:12px;border-top:1px solid rgb(229,229,229);color:rgb(115,115,115);font-size:13px;",
};

function htmlOf(locale: Locale, subject: string, blocks: readonly Block[]): string {
  const body = blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
        return `<p style="${STYLE.paragraph}">${escapeHtml(block.text)}</p>`;
      case "button":
        return `<p style="${STYLE.paragraph}"><a href="${escapeHtml(block.href)}" style="${STYLE.button}">${escapeHtml(block.label)}</a></p>`;
      case "fallback":
        return `<p style="${STYLE.paragraph}">${escapeHtml(block.lead)}<br>${escapeHtml(block.url)}</p>`;
      case "footer":
        return `<p style="${STYLE.footer}">${escapeHtml(block.text)}</p>`;
    }
  });
  return [
    "<!doctype html>",
    `<html lang="${locale}">`,
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="${STYLE.body}">`,
    `<div style="${STYLE.column}">`,
    ...body,
    "</div>",
    "</body>",
    "</html>",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
