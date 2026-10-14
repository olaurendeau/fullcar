import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { localeCookie } from "./locales";
import { negotiateLocale } from "./negotiate";

export default getRequestConfig(async () => {
  const locale = negotiateLocale(
    (await cookies()).get(localeCookie)?.value,
    (await headers()).get("accept-language"),
  );

  return {
    locale,
    // Event times are wall-clock times, shown through `wallClockAsUtc`: formatted in UTC,
    // 07:30 reads 07:30 whatever the server's or the browser's time zone (#3, C1.12).
    timeZone: "UTC",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
