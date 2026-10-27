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

  it("renders every message of the page, once, and nothing else", () => {
    const shown = POLICY.map(({ key }) => key);
    expect(new Set(shown).size).toBe(shown.length);
    for (const [locale, messages] of Object.entries(LOCALES)) {
      const own = flattenKeys(messages as Record<string, unknown>).filter((key) => key.startsWith("Privacy."));
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
      const marked = flattenKeys(messages as Record<string, unknown>)
        .filter((key) => key.startsWith("Privacy."))
        .filter((key) => MARKER.test(String(message(messages, key))));
      expect(marked, locale).toEqual([]);
    }
  });

  it("states no figure nor setting that nobody has checked (restore window, Sentry, publication date)", () => {
    const text = (messages: Record<string, unknown>, key: string) => String(message(messages, key));
    expect(text(fr, "Privacy.retention.restore")).not.toMatch(/\d\s*heures?/);
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
