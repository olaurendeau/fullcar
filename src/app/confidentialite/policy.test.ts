import type { Messages } from "next-intl";
import { describe, expect, it } from "vitest";
import { flattenKeys } from "@/i18n/keys";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { POLICY } from "./policy";

const LOCALES = { fr, en } as const;

/** A message of the page, by its full key (`Privacy.keep.title`). */
function message(messages: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((at, part) => (at as Record<string, unknown> | undefined)?.[part], messages);
}

/** Markers of a fact nobody has checked yet (privacy-policy, PP2): a page that holds one is not ready. */
const MARKER = /\[(?:À COMPLÉTER|À VÉRIFIER|À VALIDER|À FIXER|TO COMPLETE|TO CHECK|TO VALIDATE|TO SET)/;

describe("the privacy page (OA10.4, PP1)", () => {
  it("opens with its title, then has eleven sections, in the order of the structure", () => {
    expect(POLICY[0]).toEqual({ key: "Privacy.title", role: "h1" });
    expect(POLICY.filter(({ role }) => role === "h1").length).toBe(1);
    expect(POLICY.filter(({ role }) => role === "h2").map(({ key }) => key)).toEqual([
      "Privacy.controller.title",
      "Privacy.keep.title",
      "Privacy.why.title",
      "Privacy.retention.title",
      "Privacy.who.title",
      "Privacy.services.title",
      "Privacy.not.title",
      "Privacy.storage.title",
      "Privacy.rights.title",
      "Privacy.contact.title",
      "Privacy.updates.title",
    ]);
  });

  it("names the sections as the structure does, in both languages", () => {
    const titles = POLICY.filter(({ role }) => role === "h2").map(({ key }) => message(fr, key));
    expect(titles).toEqual([
      "Qui est responsable",
      "Ce que nous gardons",
      "Pourquoi",
      "Combien de temps",
      "Qui voit quoi",
      "Les services que nous utilisons",
      "Ce que nous ne faisons pas",
      "Cookies et stockage du navigateur",
      "Vos droits",
      "Nous contacter",
      "Mise à jour",
    ]);
    expect(POLICY.filter(({ role }) => role === "h2").map(({ key }) => message(en, key))).toEqual([
      "Who is responsible",
      "What we keep",
      "Why",
      "How long",
      "Who sees what",
      "The services we use",
      "What we do not do",
      "Cookies and browser storage",
      "Your rights",
      "Contact us",
      "Updates",
    ]);
  });

  it("lists every message of the page in POLICY, once, and nothing else", () => {
    const shown = POLICY.map(({ key }) => key);
    expect(new Set(shown).size).toBe(shown.length);
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const own = flattenKeys(messages as Messages).filter((key) => key.startsWith("Privacy."));
      expect(own.sort(), locale).toEqual(shown.filter((key) => key.startsWith("Privacy.")).sort());
      for (const key of shown) {
        const text = message(messages, key);
        expect(typeof text === "string" && text.trim() !== "", `${locale} ${key}`).toBe(true);
      }
    }
  });
});

describe("the text of the page (PP2)", () => {
  it("holds no marker of an unchecked fact, in either language", () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const marked = flattenKeys(messages as Messages)
        .filter((key) => key.startsWith("Privacy."))
        .filter((key) => MARKER.test(String(message(messages, key))));
      expect(marked, locale).toEqual([]);
    }
  });

  it("states no figure nor setting that nobody has checked (restore window, Sentry, publication date)", () => {
    const text = (messages: Record<string, unknown>, key: string) => String(message(messages, key));
    expect(text(fr, "Privacy.retention.restore")).not.toMatch(/\d\s*heures?/);
    expect(text(en, "Privacy.retention.restore")).not.toMatch(/\d\s*hours?/);
    expect(text(fr, "Privacy.services.sentry")).not.toMatch(/n’est pas gardée/);
    expect(text(en, "Privacy.services.sentry")).not.toMatch(/is not kept/);
    expect(text(fr, "Privacy.updates.body")).not.toMatch(/Dernière mise à jour/);
    expect(text(en, "Privacy.updates.body")).not.toMatch(/Last updated/);
  });

  it("says that Crisp may have messages processed by artificial intelligence", () => {
    expect(String(message(fr, "Privacy.services.crisp"))).toMatch(/intelligence artificielle/);
    expect(String(message(en, "Privacy.services.crisp"))).toMatch(/artificial intelligence/);
  });
});

describe("the address of a pending handover (OT8.4, OT7.3)", () => {
  const text = (messages: Record<string, unknown>, key: string) => String(message(messages, key));

  it("is a line of « Pour chaque événement », after the unconfirmed address", () => {
    const keys = POLICY.map(({ key }) => key);
    expect(POLICY.find(({ key }) => key === "Privacy.keep.event.transfer")?.role).toBe("li");
    expect(keys.indexOf("Privacy.keep.event.transfer")).toBe(keys.indexOf("Privacy.keep.event.pending") + 1);
    expect(keys.indexOf("Privacy.keep.event.transfer")).toBeLessThan(keys.indexOf("Privacy.keep.organiser.title"));
  });

  it("says the address is kept on the event while the handover waits, until day 30 at most, then erased, in French", () => {
    const line = text(fr, "Privacy.keep.event.transfer");
    expect(line).toMatch(/cession/);
    expect(line).toMatch(/30 jours après sa date au plus/);
    expect(line).toMatch(/effacée/);
    expect(line).toMatch(/liste des e-mails envoyés/);
  });

  it("says the same in English", () => {
    const line = text(en, "Privacy.keep.event.transfer");
    expect(line).toMatch(/handover/);
    expect(line).toMatch(/30 days after its date at the latest/);
    expect(line).toMatch(/erased/);
    expect(line).toMatch(/list of emails sent/);
  });

  it("announces no length of time for the sending records, which the owner has not set (OT7.3)", () => {
    expect(text(fr, "Privacy.keep.event.transfer")).not.toMatch(/\d\s*(heures?|minutes?|h\b)/);
    expect(text(en, "Privacy.keep.event.transfer")).not.toMatch(/\d\s*(hours?|minutes?|h\b)/);
  });

  it("counts the handover email among those Brevo sends", () => {
    expect(text(fr, "Privacy.services.brevo")).toMatch(/envoie les cinq e-mails du compte/);
    expect(text(en, "Privacy.services.brevo")).toMatch(/sends the account’s five emails/);
    expect(text(fr, "Privacy.services.brevo")).toMatch(/lien de connexion, de confirmation ou de cession/);
    expect(text(en, "Privacy.services.brevo")).toMatch(/sign-in, confirmation or handover link/);
  });
});
