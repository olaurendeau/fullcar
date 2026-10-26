import { describe, expect, it } from "vitest";
import { negotiateLocale } from "@/i18n/negotiate";
import { renderEmail, type EmailInput } from "./messages";

// The four emails of epic #581, word for word as « Les e-mails » says them
// (docs/design/organizer-account/README.md, v4), in French and in English.

const ORIGIN = "https://fullcar.example";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
/** 12 March 2029 in Paris. */
const DELETES_AT = new Date("2029-03-12T10:00:00Z");

const FR_FOOTER = `Fullcar · Confidentialité : ${ORIGIN}/confidentialite`;
const EN_FOOTER = `Fullcar · Privacy: ${ORIGIN}/confidentialite`;

const paragraphs = (...lines: string[]) => lines.join("\n\n");

const EXPECTED = {
  confirmation: {
    fr: {
      subject: "Confirmez votre adresse pour Fullcar",
      text: paragraphs(
        "Bonjour,",
        "Un événement vient d’être créé sur Fullcar avec cette adresse. Confirmez-la pour le retrouver dans Mes événements, sur n’importe quel appareil :",
        "[Confirmer mon adresse]",
        "Ce lien est valable 7 jours et ne sert qu’une fois. Ne le transférez pas : il ouvre l’espace organisateur, qui montre des numéros de téléphone.",
        "Ce n’était pas vous ? Ignorez cet e-mail : sans clic, cet événement n’est rattaché à aucun compte, et il est supprimé, avec l’adresse qu’il porte, 30 jours après sa date.",
        `Si le bouton ne marche pas, copiez ce lien dans votre navigateur :\n${ORIGIN}/connexion/confirmer#${TOKEN}`,
        FR_FOOTER,
      ),
    },
    en: {
      subject: "Confirm your email address for Fullcar",
      text: paragraphs(
        "Hello,",
        "An event has just been created on Fullcar with this address. Confirm it to find the event in My events, on any device:",
        "[Confirm my address]",
        "This link is valid for 7 days and works once. Do not forward it: it opens the organiser area, which shows phone numbers.",
        "Wasn’t you? Ignore this email: without a click, this event is linked to no account, and it is deleted, with the address it holds, 30 days after its date.",
        `If the button does not work, copy this link into your browser:\n${ORIGIN}/connexion/confirmer#${TOKEN}`,
        EN_FOOTER,
      ),
    },
  },
  signIn: {
    fr: {
      subject: "Votre lien de connexion à Fullcar",
      text: paragraphs(
        "Bonjour,",
        "Voici votre lien pour vous connecter à Fullcar :",
        "[Se connecter]",
        "Il est valable 1 heure et ne sert qu’une fois. Ne le transférez pas : il donne accès à vos événements.",
        "Vous n’avez rien demandé ? Ignorez cet e-mail : sans clic, aucune session ne s’ouvre.",
        `Si le bouton ne marche pas, copiez ce lien dans votre navigateur :\n${ORIGIN}/connexion/lien#${TOKEN}`,
        FR_FOOTER,
      ),
    },
    en: {
      subject: "Your Fullcar sign-in link",
      text: paragraphs(
        "Hello,",
        "Here is your link to sign in to Fullcar:",
        "[Sign in]",
        "It is valid for 1 hour and works once. Do not forward it: it gives access to your events.",
        "Didn’t ask for anything? Ignore this email: without a click, nobody is signed in.",
        `If the button does not work, copy this link into your browser:\n${ORIGIN}/connexion/lien#${TOKEN}`,
        EN_FOOTER,
      ),
    },
  },
  noAccount: {
    fr: {
      subject: "Connexion à Fullcar",
      text: paragraphs(
        "Bonjour,",
        "Quelqu’un a demandé à se connecter à Fullcar avec cette adresse, mais aucun compte n’y est rattaché. Un compte se crée avec un premier événement :",
        "[Créer un événement]",
        "Vous n’avez rien demandé ? Ignorez cet e-mail : aucun compte n’a été créé.",
        `Le bouton mène à ${ORIGIN}/nouveau`,
        FR_FOOTER,
      ),
    },
    en: {
      subject: "Signing in to Fullcar",
      text: paragraphs(
        "Hello,",
        "Someone asked to sign in to Fullcar with this address, but no account is linked to it. An account is created with a first event:",
        "[Create an event]",
        "Didn’t ask for anything? Ignore this email: no account was created.",
        `The button leads to ${ORIGIN}/nouveau`,
        EN_FOOTER,
      ),
    },
  },
  inactivityWarning: {
    fr: {
      subject: "Votre compte Fullcar sera supprimé le 12 mars 2029",
      text: paragraphs(
        "Bonjour,",
        "Votre compte Fullcar n’a pas servi depuis bientôt 3 ans. Sans visite d’ici le 12 mars 2029, il sera supprimé, avec l’historique de vos événements.",
        "Pour le garder, connectez-vous :",
        "[Se connecter]",
        "Pour qu’il soit supprimé, il n’y a rien à faire.",
        `Le bouton mène à ${ORIGIN}/connexion : il n’ouvre aucune session tout seul.`,
        FR_FOOTER,
      ),
    },
    en: {
      subject: "Your Fullcar account will be deleted on 12 March 2029",
      text: paragraphs(
        "Hello,",
        "Your Fullcar account has not been used for almost 3 years. Without a visit by 12 March 2029, it will be deleted, along with the history of your events.",
        "To keep it, sign in:",
        "[Sign in]",
        "To have it deleted, there is nothing to do.",
        `The button leads to ${ORIGIN}/connexion: it signs nobody in by itself.`,
        EN_FOOTER,
      ),
    },
  },
} as const;

type Kind = keyof typeof EXPECTED;
type Locale = "fr" | "en";

function inputOf(kind: Kind, locale: Locale): EmailInput {
  switch (kind) {
    case "confirmation":
    case "signIn":
      return { kind, locale, origin: ORIGIN, token: TOKEN };
    case "noAccount":
      return { kind, locale, origin: ORIGIN };
    case "inactivityWarning":
      return { kind, locale, origin: ORIGIN, deletesAt: DELETES_AT };
  }
}

const KINDS = Object.keys(EXPECTED) as Kind[];
const CASES = KINDS.flatMap((kind) => (["fr", "en"] as const).map((locale) => [kind, locale] as const));

/** Every `href` of an HTML document, unescaped as a browser reads it. */
function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map(([, href]) => href.replaceAll("&amp;", "&"));
}

/** The text a reader sees in an HTML document: tags removed, entities decoded. */
function visibleText(html: string): string {
  return html
    .replace(/<head>[\s\S]*<\/head>/, "")
    .replace(/<br>/g, "\n")
    .replace(/<\/p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

describe("OA3.1: each email has exactly the subject and the text of « Les e-mails »", () => {
  it.each(CASES)("%s, %s", (kind, locale) => {
    const email = renderEmail(inputOf(kind, locale));
    expect(email.subject).toBe(EXPECTED[kind][locale].subject);
    expect(email.text).toBe(EXPECTED[kind][locale].text);
  });

  it.each(CASES)("%s, %s: the HTML says the same words, the button being a link", (kind, locale) => {
    const { html } = renderEmail(inputOf(kind, locale));
    const button = EXPECTED[kind][locale].text.match(/\[(.+)\]/)![1];
    expect(visibleText(html)).toBe(EXPECTED[kind][locale].text.replace(`[${button}]`, button));
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain(`<title>${EXPECTED[kind][locale].subject}</title>`);
  });

  it.each(KINDS)("%s: a page in de-DE, which the site shows in French, gets the French email", (kind) => {
    const locale = negotiateLocale(undefined, "de-DE,de;q=0.9");
    expect(renderEmail(inputOf(kind, locale))).toEqual(renderEmail(inputOf(kind, "fr")));
    expect(renderEmail(inputOf(kind, locale)).subject).toBe(EXPECTED[kind].fr.subject);
  });

  it("dates the warning in Paris: 23:30 UTC on 11 March is already 12 March there", () => {
    const email = renderEmail({ kind: "inactivityWarning", locale: "fr", origin: ORIGIN, deletesAt: new Date("2029-03-11T23:30:00Z") });
    expect(email.subject).toBe("Votre compte Fullcar sera supprimé le 12 mars 2029");
  });

  it("writes the first of a month « 1er » in French, « 1 » in English (#625)", () => {
    const deletesAt = new Date("2029-05-01T10:00:00Z");
    const fr = renderEmail({ kind: "inactivityWarning", locale: "fr", origin: ORIGIN, deletesAt });
    const en = renderEmail({ kind: "inactivityWarning", locale: "en", origin: ORIGIN, deletesAt });
    expect(fr.subject).toBe("Votre compte Fullcar sera supprimé le 1er mai 2029");
    expect(fr.text).toContain("Sans visite d’ici le 1er mai 2029, il sera supprimé");
    expect(en.subject).toBe("Your Fullcar account will be deleted on 1 May 2029");
    expect(en.text).toContain("Without a visit by 1 May 2029, it will be deleted");
  });
});

describe("OA3.2: no text typed by anyone", () => {
  it("a title and a place given along with the input reach neither the subject, the text nor the HTML", () => {
    const typed = { title: "Zorglub <b>x</b>", location: "Zorglub-lieu", firstName: "Zorglub" };
    const input = { ...inputOf("confirmation", "fr"), ...typed };
    const email = renderEmail(input);
    for (const part of [email.subject, email.text, email.html]) expect(part).not.toContain("Zorglub");
  });

  it("the input has no field for a title, a place or a first name", () => {
    // @ts-expect-error: no title.
    renderEmail({ kind: "confirmation", locale: "fr", origin: ORIGIN, token: TOKEN, title: "x" });
    // @ts-expect-error: no place.
    renderEmail({ kind: "signIn", locale: "fr", origin: ORIGIN, token: TOKEN, location: "x" });
    // @ts-expect-error: no first name.
    renderEmail({ kind: "noAccount", locale: "fr", origin: ORIGIN, firstName: "x" });
    expect(true).toBe(true);
  });
});

describe("OA3.3: our HTML has no image and links only to the site", () => {
  it.each(CASES)("%s, %s", (kind, locale) => {
    const { html, text } = renderEmail(inputOf(kind, locale));
    expect(html).not.toMatch(/<img|<picture|<svg|background(-image)?\s*[:=]\s*[^;"]*url\(|<link|<script|<iframe|src=/i);
    const hrefs = hrefsOf(html);
    expect(hrefs).toHaveLength(1);
    for (const href of hrefs) expect(href.startsWith(`${ORIGIN}/`)).toBe(true);
    // Every address written out, in the text as in the HTML, is the site's: nothing else to call.
    for (const part of [html, text]) {
      for (const [url] of part.matchAll(/(https?:)?\/\/[^\s"<>]+/g)) expect(url.startsWith(`${ORIGIN}/`)).toBe(true);
    }
  });

  it("refuses an origin that is more than an origin", () => {
    for (const origin of ["https://fullcar.example/", "https://fullcar.example/x", "https://evil.example?x=1", "javascript:alert(1)", "fullcar.example"]) {
      expect(() => renderEmail({ kind: "noAccount", locale: "fr", origin })).toThrow();
    }
  });
});

describe("OA3.4: the links of the emails", () => {
  it.each([
    ["confirmation", "/connexion/confirmer"],
    ["signIn", "/connexion/lien"],
  ] as const)("%s: path %s, no query string, the token after #", (kind, path) => {
    for (const locale of ["fr", "en"] as const) {
      const { html, text } = renderEmail(inputOf(kind, locale));
      const links = [...hrefsOf(html), ...[...text.matchAll(/https:\/\/\S+/g)].map(([url]) => url)].filter((url) => !url.endsWith("/confidentialite"));
      expect(links.length).toBe(2);
      for (const link of links) {
        const url = new URL(link);
        expect(url.origin).toBe(ORIGIN);
        expect(url.pathname).toBe(path);
        expect(url.search).toBe("");
        expect(url.hash).toBe(`#${TOKEN}`);
      }
    }
  });

  it("the warning carries no token: its link is /connexion", () => {
    for (const locale of ["fr", "en"] as const) {
      const { html, text } = renderEmail(inputOf("inactivityWarning", locale));
      expect(hrefsOf(html).filter((href) => !href.endsWith("/confidentialite"))).toEqual([`${ORIGIN}/connexion`]);
      expect(text).not.toContain("#");
    }
  });

  it("the email for an address with no account leads to /nouveau, without a token", () => {
    const { html, text } = renderEmail(inputOf("noAccount", "fr"));
    expect(hrefsOf(html).filter((href) => !href.endsWith("/confidentialite"))).toEqual([`${ORIGIN}/nouveau`]);
    expect(text).not.toContain("#");
  });

  it("refuses a token that is not base64url, rather than write it into a link", () => {
    for (const token of ["", "abc def", "abc?x=1", "abc#x", 'a"b', "a<b"]) {
      expect(() => renderEmail({ kind: "signIn", locale: "fr", origin: ORIGIN, token })).toThrow();
    }
  });

  it("never writes the refused token into the error's message: errors end up in logs (#625)", () => {
    for (const token of ["abc def", "abc?x=1", "abc#x", 'a"b', "a<b", `${TOKEN}!`]) {
      let message: string | undefined;
      try {
        renderEmail({ kind: "signIn", locale: "fr", origin: ORIGIN, token });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBeDefined();
      expect(message).not.toContain(token);
    }
  });
});
