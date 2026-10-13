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
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
