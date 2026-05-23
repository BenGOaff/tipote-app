// app/affiliate/i18n/index.ts
//
// Point d'entrée pour les traductions de l'espace affilié. Usage :
//
//   // Server component :
//   import { getDict } from "@/app/affiliate/i18n";
//   const t = getDict(session.locale);
//   return <h1>{t.overview.greeting}</h1>;
//
//   // Client component :
//   import { useDict } from "@/app/affiliate/i18n/context";
//   const t = useDict();
//   return <Button>{t.common.copy}</Button>;
//
// Pour les strings à interpolation ({name}, {count}…), utiliser le
// helper `interpolate()` ou String.replace direct.

import { FR } from "./fr";
import { EN } from "./en";
import { ES } from "./es";
import { IT } from "./it";
import { PT } from "./pt";
import { AR } from "./ar";
import type { AffiliateDict, AffiliateLocale } from "./types";
import { isAffiliateLocale } from "./types";

const DICTS: Record<AffiliateLocale, AffiliateDict> = {
  fr: FR,
  en: EN,
  es: ES,
  it: IT,
  pt: PT,
  ar: AR,
};

/** Retourne le dictionnaire pour la locale donnée. Fallback EN si la
 *  locale n'est pas supportée (cas d'un user avec une locale exotique
 *  type "ja" ou null). */
export function getDict(locale?: string | null): AffiliateDict {
  if (locale && isAffiliateLocale(locale)) return DICTS[locale];
  return EN;
}

/** Normalise une locale brute en locale supportée. Utile quand on
 *  reçoit Accept-Language ou navigator.language (genre "fr-FR" → "fr"). */
export function normaliseLocale(raw?: string | null): AffiliateLocale {
  if (!raw) return "en";
  const short = raw.slice(0, 2).toLowerCase();
  return isAffiliateLocale(short) ? short : "en";
}

/** Remplace les placeholders {key} dans une string par les valeurs
 *  fournies. Exemple :
 *    interpolate("Hello {name}", { name: "Alice" }) → "Hello Alice"
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export type { AffiliateDict, AffiliateLocale } from "./types";
