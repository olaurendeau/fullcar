import { useLocale, useTimeZone } from "next-intl";

/**
 * A date as Intl writes it, except the first day of a month in French: « 1er mai », as
 * French typography wants it, not « 1 mai » (#625). Every other day, and English, unchanged.
 * Every date of the site that shows a day goes through here: the e-mails and the views.
 */
export function formatDate(locale: string, date: Date, options: Intl.DateTimeFormatOptions): string {
  const formatter = new Intl.DateTimeFormat(locale, options);
  // `format` itself outside French: V8's `formatToParts` keeps the narrow no-break space
  // before « AM » that `format` turns into a space, and English must not change.
  if (new Intl.Locale(locale).language !== "fr") return formatter.format(date);
  return formatter
    .formatToParts(date)
    .map((part) => (part.type === "day" && part.value === "1" ? "1er" : part.value))
    .join("");
}

/**
 * `formatDate` in the page's locale and time zone (`UTC`, src/i18n/request.ts), as
 * `useFormatter().dateTime` would: what a view calls instead of it for a date with a day.
 */
export function useFormatDate(): (date: Date, options: Intl.DateTimeFormatOptions) => string {
  const locale = useLocale();
  const timeZone = useTimeZone();
  return (date, options) => formatDate(locale, date, { timeZone, ...options });
}
