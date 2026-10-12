import { readFileSync } from "node:fs";
import { defaultLocale, locales } from "../src/i18n/locales";
import { diffMessages } from "../src/i18n/keys";

const load = (locale: string) =>
  JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

const reference = load(defaultLocale);
let failed = false;

for (const locale of [defaultLocale, ...locales.filter((l) => l !== defaultLocale)]) {
  const { missing, extra, empty } = diffMessages(reference, load(locale));
  for (const key of missing) console.error(`${locale}: missing ${key}`);
  for (const key of extra) console.error(`${locale}: not in ${defaultLocale}: ${key}`);
  for (const key of empty) console.error(`${locale}: empty ${key}`);
  failed ||= missing.length + extra.length + empty.length > 0;
}

if (failed) process.exit(1);
console.log(`i18n: ${locales.join(", ")} have the same keys`);
