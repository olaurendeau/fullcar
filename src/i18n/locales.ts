export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fr";
export const localeCookie = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}

/** The language the switch offers: the one the page is not in (#113). */
export function otherLocale(locale: Locale): Locale {
  return locale === "fr" ? "en" : "fr";
}

/**
 * The device remembers the choice for the whole site, for a year, renewed at each switch
 * (#113, decision 1). Lax: a shared link opened from another site keeps the language.
 */
export function localeCookieOptions(secure: boolean) {
  return { path: "/", sameSite: "lax", maxAge: 365 * 24 * 60 * 60, secure } as const;
}
