import { defaultLocale, isLocale, type Locale } from "./locales";

/**
 * Picks the locale without any prefix in the URL: an explicit choice (cookie) wins,
 * then the browser's Accept-Language, then French.
 */
export function negotiateLocale(
  cookie: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (isLocale(cookie)) return cookie;

  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return {
        language: tag.trim().toLowerCase().split("-")[0],
        quality: q ? Number(q.trim().slice(2)) : 1,
        index,
      };
    })
    .filter((entry) => entry.language && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  return ranked.map((entry) => entry.language).find(isLocale) ?? defaultLocale;
}
