// lib/compta/countries.ts
//
// Détection "user français" pour gater l'onglet Compta. Le champ
// `business_profiles.country` est rempli en texte libre à l'onboarding,
// donc on tolère plusieurs orthographes/casses pour ne pas exclure des
// users légitimes (qui auraient tapé "fr", "française", "FRANCE", etc.).
//
// Les autres pays apparaîtront un par un dans cette liste à mesure
// qu'on porte la compta (Belgique → Suisse → Québec → Portugal …).
// Tant que le pays de l'user n'est pas dans `SUPPORTED_COUNTRIES`,
// l'onglet Compta affiche un message "bientôt disponible pour [pays]".

const FRANCE_SYNONYMS = new Set([
  "france",
  "fr",
  "francais",
  "francaise",
  "fra",
  "french",
]);

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    // dégage les diacritiques (accents, cédille, etc.) —
    // U+0300..U+036F = bloc "Combining Diacritical Marks"
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function isFrenchCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return FRANCE_SYNONYMS.has(normalize(country));
}

/** Liste des pays pour lesquels Tipote propose la compta. Au lancement
 *  uniquement la France ; on ajoutera Belgique, Suisse, Québec,
 *  Portugal, Espagne, etc. au fur et à mesure du développement. */
export const SUPPORTED_COUNTRIES: ReadonlyArray<{ code: string; label: string; synonyms: ReadonlyArray<string> }> = [
  {
    code: "FR",
    label: "France",
    synonyms: Array.from(FRANCE_SYNONYMS),
  },
];

/** Liste de pays affichée dans le sélecteur quand l'user n'a pas
 *  encore renseigné son pays. Triée par fréquence francophone car
 *  Tipote est franco-centré aujourd'hui. */
export const COUNTRY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "France", label: "France" },
  { value: "Belgique", label: "Belgique" },
  { value: "Suisse", label: "Suisse" },
  { value: "Luxembourg", label: "Luxembourg" },
  { value: "Canada", label: "Canada / Québec" },
  { value: "Portugal", label: "Portugal" },
  { value: "Espagne", label: "Espagne" },
  { value: "Italie", label: "Italie" },
  { value: "Maroc", label: "Maroc" },
  { value: "Algérie", label: "Algérie" },
  { value: "Tunisie", label: "Tunisie" },
  { value: "Sénégal", label: "Sénégal" },
  { value: "Côte d'Ivoire", label: "Côte d'Ivoire" },
  { value: "États-Unis", label: "États-Unis" },
  { value: "Royaume-Uni", label: "Royaume-Uni" },
  { value: "Allemagne", label: "Allemagne" },
  { value: "Autre", label: "Autre" },
];
