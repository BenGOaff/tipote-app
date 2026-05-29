// Langues supportées pour les contenus affiliés (articles / emails / posts /
// visuels). Alignées sur les 7 locales d'interface de l'app Tipote. Stockées
// telles quelles dans `affiliate_contents.locale`. Le label en endonyme est
// utilisé dans les sélecteurs UI (admin Béné + picker affilié) pour qu'un
// FR voit « Português », un PT voit « Português », etc.

export const AFFILIATE_CONTENT_LOCALES = ["fr", "en", "es", "it", "pt", "pt-BR", "ar"] as const;
export type AffiliateContentLocale = (typeof AFFILIATE_CONTENT_LOCALES)[number];

// Marchés réellement OUVERTS aux affiliés (interface + contenu promo dispo).
// L'admin (Béné) garde accès à TOUTES les locales pour PRÉPARER le contenu ;
// les affiliés ne voient que ceux-ci. Élargir au fur et à mesure que le
// contenu d'un marché est prêt.
export const AFFILIATE_LIVE_LOCALES = ["fr", "en"] as const satisfies readonly AffiliateContentLocale[];

const LABELS: Record<AffiliateContentLocale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  "pt-BR": "Português (BR)",
  ar: "العربية",
};

export function localeLabel(loc: string): string {
  return (LABELS as Record<string, string>)[loc] ?? loc;
}

export function isContentLocale(s: string | null | undefined): s is AffiliateContentLocale {
  return !!s && (AFFILIATE_CONTENT_LOCALES as readonly string[]).includes(s);
}

export function normaliseContentLocale(s: string | null | undefined, fallback: AffiliateContentLocale = "fr"): AffiliateContentLocale {
  return isContentLocale(s) ? s : fallback;
}
