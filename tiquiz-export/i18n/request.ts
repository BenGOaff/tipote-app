// i18n/request.ts
// next-intl server-side locale detection.
// Locale comes from the ui_locale cookie (set by LanguageSwitcher or first-visit middleware).

import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "./config";

export type { SupportedLocale };
export { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./config";
export { RTL_LOCALES } from "./config";

function isSupportedLocale(v: string): v is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("ui_locale")?.value ?? "";
  const locale: SupportedLocale = isSupportedLocale(raw) ? raw : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
