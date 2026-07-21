// i18n/config.ts
// Shared locale constants — safe to import in both server AND client components.
// Do NOT add server-only imports (next/headers, next-intl/server) here.

export const SUPPORTED_LOCALES = ["fr", "en", "es", "it", "ar", "pt", "pt-BR"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "fr";
export const RTL_LOCALES: SupportedLocale[] = ["ar"];

// Étiquettes lisibles par locale (langue native). Partagées entre le
// sélecteur de langue de l'interface et le sélecteur de langue du quiz
// (langue du joueur public) dans l'éditeur.
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  it: "Italiano",
  ar: "العربية",
  pt: "Português (Portugal)",
  "pt-BR": "Português (Brasil)",
};
