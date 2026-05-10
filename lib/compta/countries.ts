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

const SWITZERLAND_SYNONYMS = new Set([
  "suisse",
  "ch",
  "suiss",
  "schweiz",
  "switzerland",
  "svizzera",
  "helvetia",
  "che",
]);

const PORTUGAL_SYNONYMS = new Set([
  "portugal",
  "pt",
  "portugais",
  "portugaise",
  "prt",
  "portuguese",
  "portugues",
  "portuguesa",
]);

const BELGIUM_SYNONYMS = new Set([
  "belgique",
  "belgie",
  "belgium",
  "be",
  "bel",
  "belge",
  "belgian",
]);

const SPAIN_SYNONYMS = new Set([
  "espagne",
  "es",
  "espagnol",
  "espagnole",
  "espana",
  "spain",
  "spanish",
  "esp",
  "espanol",
  "espanola",
]);

const CANADA_SYNONYMS = new Set([
  "canada",
  "ca",
  "can",
  "canadien",
  "canadienne",
  "canadian",
  "quebec",
  "qc",
  "quebecois",
  "quebecoise",
]);

const USA_SYNONYMS = new Set([
  "etats-unis",
  "etats unis",
  "etatsunis",
  "us",
  "usa",
  "united states",
  "america",
  "american",
  "americain",
  "americaine",
  "us of a",
  "u.s.",
  "u.s.a.",
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

export function isSwissCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return SWITZERLAND_SYNONYMS.has(normalize(country));
}

export function isPortugueseCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return PORTUGAL_SYNONYMS.has(normalize(country));
}

export function isBelgianCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return BELGIUM_SYNONYMS.has(normalize(country));
}

export function isSpanishCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return SPAIN_SYNONYMS.has(normalize(country));
}

export function isCanadianCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return CANADA_SYNONYMS.has(normalize(country));
}

export function isAmericanCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return USA_SYNONYMS.has(normalize(country));
}

/** Code pays normalisé. Évite de dispatcher sur le texte brut dans
 *  toute l'app. */
export function detectCountryCode(
  country: string | null | undefined,
): "FR" | "CH" | "PT" | "BE" | "ES" | "CA" | "US" | null {
  if (isFrenchCountry(country)) return "FR";
  if (isSwissCountry(country)) return "CH";
  if (isPortugueseCountry(country)) return "PT";
  if (isBelgianCountry(country)) return "BE";
  if (isSpanishCountry(country)) return "ES";
  if (isCanadianCountry(country)) return "CA";
  if (isAmericanCountry(country)) return "US";
  return null;
}

/** Liste des pays pour lesquels Tipote propose la compta. */
export const SUPPORTED_COUNTRIES: ReadonlyArray<{ code: string; label: string; synonyms: ReadonlyArray<string> }> = [
  {
    code: "FR",
    label: "France",
    synonyms: Array.from(FRANCE_SYNONYMS),
  },
  {
    code: "CH",
    label: "Suisse",
    synonyms: Array.from(SWITZERLAND_SYNONYMS),
  },
  {
    code: "PT",
    label: "Portugal",
    synonyms: Array.from(PORTUGAL_SYNONYMS),
  },
  {
    code: "BE",
    label: "Belgique",
    synonyms: Array.from(BELGIUM_SYNONYMS),
  },
  {
    code: "ES",
    label: "Espagne",
    synonyms: Array.from(SPAIN_SYNONYMS),
  },
  {
    code: "CA",
    label: "Canada",
    synonyms: Array.from(CANADA_SYNONYMS),
  },
  {
    code: "US",
    label: "États-Unis",
    synonyms: Array.from(USA_SYNONYMS),
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
