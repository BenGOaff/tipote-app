// i18n/request.ts
// next-intl server-side locale detection.
// Locale comes from the ui_locale cookie (set by LanguageSwitcher or first-visit middleware).
// Falls back to 'fr' if the cookie is missing or the locale is unsupported.

import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const SUPPORTED_LOCALES = ["fr", "en", "es", "it", "ar"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "fr";
export const RTL_LOCALES: SupportedLocale[] = ["ar"];

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
