// i18n/config.ts
// Shared locale constants — safe to import in both server AND client components.
// Do NOT add server-only imports (next/headers, next-intl/server) here.

export const SUPPORTED_LOCALES = ["fr", "en", "es", "it", "ar"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "fr";
export const RTL_LOCALES: SupportedLocale[] = ["ar"];
