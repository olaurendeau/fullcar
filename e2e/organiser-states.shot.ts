import { randomUUID } from "node:crypto";
import type { Page, TestInfo } from "@playwright/test";
import type { Kysely } from "kysely";
import { anonymiseEvent } from "@/db/day-thirty";
import type { Database } from "@/db/schema";
import { seedAccount, seedSession } from "@/db/test-accounts";
import { confirmSeededEvent } from "@/db/test-events";
import { expect, leaveNoToken, test } from "./fixtures";
import { organiserPath } from "./organiser";

leaveNoToken();

/*
 * #598, OA11.2: the screens of a refused organiser area at WIDTH px (360 by default), in French
 * and in English, without scrolling sideways; « pas le vôtre » with an address of 60 characters
 * and no break point. Each capture waits for its title: the client has had the server's answer.
 */

const LOCALES = [
  ["fr", "fr-FR"],
  ["en", "en-GB"],
] as const;

type Arrange = (page: Page, db: Kysely<Database>, eventId: string, keep: (id: string) => void) => Promise<void>;

async function holdSession(page: Page, db: Kysely<Database>, accountId: string) {
  const token = await seedSession(db, accountId);
  await page.addInitScript((value) => localStorage.setItem("fullcar:session", value), token);
}

const SCREENS: [string, Record<"fr" | "en", string>, Arrange][] = [
  ["en-attente", { fr: "Adresse pas encore confirmée", en: "Email address not confirmed yet" }, async () => {}],
  [
    "connexion",
    { fr: "Espace organisateur", en: "Organiser area" },
    async (_, db, eventId, keep) => keep(await confirmSeededEvent(db, eventId)),
  ],
  [
    "pas-le-votre",
    { fr: "Cet espace organisateur n’est pas le vôtre", en: "This organiser area is not yours" },
    async (page, db, eventId, keep) => {
      keep(await confirmSeededEvent(db, eventId));
      const other = await seedAccount(db, { email: `${randomUUID().replaceAll("-", "")}${"x".repeat(17)}@exemple.fr` });
      keep(other);
      await holdSession(page, db, other);
    },
  ],
  [
    "sans-organisateur",
    { fr: "Cet événement n’a plus d’organisateur", en: "This event no longer has an organiser" },
    async (_, db, eventId) => {
      const organiser = await confirmSeededEvent(db, eventId);
      await db.deleteFrom("account").where("id", "=", organiser).execute();
    },
  ],
  [
    "inscriptions-effacees",
    { fr: "Tournoi de Rennes", en: "Tournoi de Rennes" },
    async (page, db, eventId, keep) => {
      const organiser = await confirmSeededEvent(db, eventId);
      keep(organiser);
      await holdSession(page, db, organiser);
      await anonymiseEvent(db, eventId);
    },
  ],
];

async function shoot(page: Page, testInfo: TestInfo, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls sideways`).toBe(0);
  await page.screenshot({
    path: `var/shots/${name}-${testInfo.project.use.viewport?.width}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

for (const [lang, locale] of LOCALES) {
  test.describe(`the organiser area refused, in ${locale}`, () => {
    test.use({ locale });

    for (const [name, titles, arrange] of SCREENS) {
      test(`${name}, ${lang}`, async ({ page, db, seededEvent }, testInfo) => {
        const accounts: string[] = [];
        try {
          await arrange(page, db, seededEvent.id, (id) => accounts.push(id));
          await page.goto(organiserPath(seededEvent), { waitUntil: "networkidle" });
          await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(titles[lang]);
          await shoot(page, testInfo, `organiser-${name}-${lang}`);
        } finally {
          if (accounts.length > 0) await db.deleteFrom("account").where("id", "in", accounts).execute();
        }
      });
    }
  });
}
