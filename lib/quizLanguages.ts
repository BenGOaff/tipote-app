// lib/quizLanguages.ts
// Comprehensive catalogue of languages available for AI quiz generation.
//
// Why this lives here:
// - The UI (next-intl) only supports a few locales: see `i18n/config.ts`.
// - Quiz CONTENT generation is decoupled from UI language — any user can
//   ask the AI to produce a quiz in Japanese, Swahili, etc., regardless of
//   the UI they read.
//
// `code` is the BCP 47 language tag we forward to the model. The model is
// fluent enough that any valid tag (or even free-form name) works, but a
// stable enum gives us autocompletion + analytics + persistence safety.

export type QuizLanguage = {
  /** BCP 47 tag — what we send to the AI and persist in DB */
  code: string;
  /** Endonym — name of the language in itself (e.g. "Français") */
  nativeName: string;
  /** English name — used for AI prompt clarity and search */
  englishName: string;
  /**
   * ISO 3166-1 alpha-2 (lowercase) country code used to render an actual
   * flag image (via flagcdn). We deliberately don't ship emoji flag glyphs
   * because they fall back to letter sequences ("FR", "DE", …) on Windows
   * and on systems without flag fonts — which looks broken.
   * Leave undefined for languages that aren't tied to a single country
   * (generic English, etc.) — the picker shows a globe icon instead.
   */
  country?: string;
  /** Right-to-left script */
  rtl?: boolean;
  /** Whether to surface this language in the "popular" pinned section */
  popular?: boolean;
  /**
   * Optional regional / cultural notes appended to the AI prompt
   * (e.g. accent of Portuguese from Portugal vs Brazil). The model uses
   * this to pick correct vocabulary, idioms, currency, examples.
   */
  regionalNotes?: string;
};

/**
 * Languages we want to pin to the top of the picker — covers >90% of
 * Tipote/Tiquiz usage today. Order here = display order.
 */
const POPULAR_CODES = [
  "fr",
  "fr-CA",
  "en",
  "en-GB",
  "en-US",
  "es",
  "es-MX",
  "it",
  "de",
  "pt",
  "pt-BR",
  "ar",
  "nl",
  "ru",
  "zh",
  "ja",
  "ko",
  "hi",
  "tr",
] as const;

/**
 * Full catalogue. Stays alphabetical by english name to make maintenance
 * obvious. Native names are spelled in their own script when applicable.
 */
const RAW_LANGUAGES: QuizLanguage[] = [
  { code: "af", nativeName: "Afrikaans", englishName: "Afrikaans", country: "za" },
  { code: "sq", nativeName: "Shqip", englishName: "Albanian", country: "al" },
  { code: "am", nativeName: "አማርኛ", englishName: "Amharic", country: "et" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", country: "sa", rtl: true,
    regionalNotes: "Modern Standard Arabic (الفصحى) suitable for most Arab markets." },
  { code: "ar-EG", nativeName: "العربية (مصر)", englishName: "Arabic (Egypt)", country: "eg", rtl: true,
    regionalNotes: "Egyptian Arabic dialect, casual tone." },
  { code: "ar-MA", nativeName: "العربية (المغرب)", englishName: "Arabic (Morocco)", country: "ma", rtl: true,
    regionalNotes: "Moroccan Darija expressions where appropriate." },
  { code: "hy", nativeName: "Հայերեն", englishName: "Armenian", country: "am" },
  { code: "az", nativeName: "Azərbaycanca", englishName: "Azerbaijani", country: "az" },
  { code: "eu", nativeName: "Euskara", englishName: "Basque", country: "es" },
  { code: "be", nativeName: "Беларуская", englishName: "Belarusian", country: "by" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali", country: "bd" },
  { code: "bs", nativeName: "Bosanski", englishName: "Bosnian", country: "ba" },
  { code: "bg", nativeName: "Български", englishName: "Bulgarian", country: "bg" },
  { code: "my", nativeName: "မြန်မာ", englishName: "Burmese", country: "mm" },
  { code: "ca", nativeName: "Català", englishName: "Catalan", country: "es" },
  { code: "zh", nativeName: "简体中文", englishName: "Chinese (Simplified)", country: "cn",
    regionalNotes: "Simplified Chinese characters, mainland China conventions." },
  { code: "zh-TW", nativeName: "繁體中文", englishName: "Chinese (Traditional)", country: "tw",
    regionalNotes: "Traditional Chinese characters, Taiwan/HK conventions." },
  { code: "hr", nativeName: "Hrvatski", englishName: "Croatian", country: "hr" },
  { code: "cs", nativeName: "Čeština", englishName: "Czech", country: "cz" },
  { code: "da", nativeName: "Dansk", englishName: "Danish", country: "dk" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch", country: "nl" },
  { code: "nl-BE", nativeName: "Nederlands (België)", englishName: "Dutch (Belgium / Flemish)", country: "be",
    regionalNotes: "Flemish vocabulary and idioms used in Belgium." },
  { code: "en", nativeName: "English", englishName: "English",
    regionalNotes: "Neutral international English." },
  { code: "en-GB", nativeName: "English (UK)", englishName: "English (British)", country: "gb",
    regionalNotes: "British spelling and idioms (colour, organise, mate, brilliant)." },
  { code: "en-US", nativeName: "English (US)", englishName: "English (American)", country: "us",
    regionalNotes: "American spelling and idioms (color, organize, awesome)." },
  { code: "en-AU", nativeName: "English (Australia)", englishName: "English (Australian)", country: "au",
    regionalNotes: "Australian English, casual register." },
  { code: "et", nativeName: "Eesti", englishName: "Estonian", country: "ee" },
  { code: "fil", nativeName: "Filipino", englishName: "Filipino", country: "ph" },
  { code: "fi", nativeName: "Suomi", englishName: "Finnish", country: "fi" },
  { code: "fr", nativeName: "Français", englishName: "French", country: "fr",
    regionalNotes: "French from France: standard metropolitan French." },
  { code: "fr-BE", nativeName: "Français (Belgique)", englishName: "French (Belgium)", country: "be",
    regionalNotes: "Belgian French expressions where natural." },
  { code: "fr-CA", nativeName: "Français (Canada)", englishName: "French (Canadian)", country: "ca",
    regionalNotes: "Quebec French vocabulary and turns of phrase." },
  { code: "fr-CH", nativeName: "Français (Suisse)", englishName: "French (Switzerland)", country: "ch",
    regionalNotes: "Swiss French — septante / nonante etc." },
  { code: "gl", nativeName: "Galego", englishName: "Galician", country: "es" },
  { code: "ka", nativeName: "ქართული", englishName: "Georgian", country: "ge" },
  { code: "de", nativeName: "Deutsch", englishName: "German", country: "de",
    regionalNotes: "Standard High German for Germany." },
  { code: "de-AT", nativeName: "Deutsch (Österreich)", englishName: "German (Austria)", country: "at",
    regionalNotes: "Austrian German vocabulary." },
  { code: "de-CH", nativeName: "Deutsch (Schweiz)", englishName: "German (Switzerland)", country: "ch",
    regionalNotes: "Swiss German written conventions (no ß, etc.)." },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek", country: "gr" },
  { code: "gu", nativeName: "ગુજરાતી", englishName: "Gujarati", country: "in" },
  { code: "ha", nativeName: "Hausa", englishName: "Hausa", country: "ng" },
  { code: "he", nativeName: "עברית", englishName: "Hebrew", country: "il", rtl: true },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", country: "in" },
  { code: "hu", nativeName: "Magyar", englishName: "Hungarian", country: "hu" },
  { code: "is", nativeName: "Íslenska", englishName: "Icelandic", country: "is" },
  { code: "ig", nativeName: "Igbo", englishName: "Igbo", country: "ng" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian", country: "id" },
  { code: "ga", nativeName: "Gaeilge", englishName: "Irish", country: "ie" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", country: "it" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", country: "jp" },
  { code: "kn", nativeName: "ಕನ್ನಡ", englishName: "Kannada", country: "in" },
  { code: "kk", nativeName: "Қазақша", englishName: "Kazakh", country: "kz" },
  { code: "km", nativeName: "ខ្មែរ", englishName: "Khmer", country: "kh" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", country: "kr" },
  { code: "ky", nativeName: "Кыргызча", englishName: "Kyrgyz", country: "kg" },
  { code: "lo", nativeName: "ລາວ", englishName: "Lao", country: "la" },
  { code: "lv", nativeName: "Latviešu", englishName: "Latvian", country: "lv" },
  { code: "lt", nativeName: "Lietuvių", englishName: "Lithuanian", country: "lt" },
  { code: "lb", nativeName: "Lëtzebuergesch", englishName: "Luxembourgish", country: "lu" },
  { code: "mk", nativeName: "Македонски", englishName: "Macedonian", country: "mk" },
  { code: "mg", nativeName: "Malagasy", englishName: "Malagasy", country: "mg" },
  { code: "ms", nativeName: "Bahasa Melayu", englishName: "Malay", country: "my" },
  { code: "ml", nativeName: "മലയാളം", englishName: "Malayalam", country: "in" },
  { code: "mt", nativeName: "Malti", englishName: "Maltese", country: "mt" },
  { code: "mr", nativeName: "मराठी", englishName: "Marathi", country: "in" },
  { code: "mn", nativeName: "Монгол", englishName: "Mongolian", country: "mn" },
  { code: "ne", nativeName: "नेपाली", englishName: "Nepali", country: "np" },
  { code: "no", nativeName: "Norsk", englishName: "Norwegian", country: "no" },
  { code: "ps", nativeName: "پښتو", englishName: "Pashto", country: "af", rtl: true },
  { code: "fa", nativeName: "فارسی", englishName: "Persian", country: "ir", rtl: true },
  { code: "pl", nativeName: "Polski", englishName: "Polish", country: "pl" },
  // Two distinct Portuguese variants — see the user feedback that triggered this.
  { code: "pt", nativeName: "Português (Portugal)", englishName: "Portuguese (Portugal)", country: "pt",
    regionalNotes: "European Portuguese: orthography and vocabulary from Portugal (e.g. 'autocarro', 'pequeno-almoço'). Avoid Brazilian gerundivos." },
  { code: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazilian)", country: "br",
    regionalNotes: "Brazilian Portuguese: warm, informal register typical of BR marketing (você, gerundivos, R$)." },
  { code: "pa", nativeName: "ਪੰਜਾਬੀ", englishName: "Punjabi", country: "in" },
  { code: "ro", nativeName: "Română", englishName: "Romanian", country: "ro" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", country: "ru" },
  { code: "sr", nativeName: "Српски", englishName: "Serbian", country: "rs" },
  { code: "si", nativeName: "සිංහල", englishName: "Sinhala", country: "lk" },
  { code: "sk", nativeName: "Slovenčina", englishName: "Slovak", country: "sk" },
  { code: "sl", nativeName: "Slovenščina", englishName: "Slovenian", country: "si" },
  { code: "so", nativeName: "Soomaali", englishName: "Somali", country: "so" },
  { code: "es", nativeName: "Español (España)", englishName: "Spanish (Spain)", country: "es",
    regionalNotes: "Castilian Spanish from Spain (vosotros, ordenador, móvil, €)." },
  { code: "es-MX", nativeName: "Español (México)", englishName: "Spanish (Mexico)", country: "mx",
    regionalNotes: "Mexican Spanish (computadora, celular, MXN)." },
  { code: "es-AR", nativeName: "Español (Argentina)", englishName: "Spanish (Argentina)", country: "ar",
    regionalNotes: "Argentinian Spanish — voseo, ARS." },
  { code: "es-CO", nativeName: "Español (Colombia)", englishName: "Spanish (Colombia)", country: "co" },
  { code: "es-CL", nativeName: "Español (Chile)", englishName: "Spanish (Chile)", country: "cl" },
  { code: "sw", nativeName: "Kiswahili", englishName: "Swahili", country: "ke" },
  { code: "sv", nativeName: "Svenska", englishName: "Swedish", country: "se" },
  { code: "tg", nativeName: "Тоҷикӣ", englishName: "Tajik", country: "tj" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil", country: "in" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu", country: "in" },
  { code: "th", nativeName: "ไทย", englishName: "Thai", country: "th" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", country: "tr" },
  { code: "uk", nativeName: "Українська", englishName: "Ukrainian", country: "ua" },
  { code: "ur", nativeName: "اردو", englishName: "Urdu", country: "pk", rtl: true },
  { code: "uz", nativeName: "Oʻzbekcha", englishName: "Uzbek", country: "uz" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", country: "vn" },
  { code: "cy", nativeName: "Cymraeg", englishName: "Welsh", country: "gb" },
  { code: "yo", nativeName: "Yorùbá", englishName: "Yoruba", country: "ng" },
  { code: "zu", nativeName: "isiZulu", englishName: "Zulu", country: "za" },
];

/** Marks popular flag and freezes the list. */
export const QUIZ_LANGUAGES: ReadonlyArray<QuizLanguage> = RAW_LANGUAGES.map(
  (l) => ({ ...l, popular: (POPULAR_CODES as readonly string[]).includes(l.code) }),
);

/** Quick lookup map by code. */
export const QUIZ_LANGUAGE_BY_CODE: Readonly<Record<string, QuizLanguage>> =
  Object.freeze(
    QUIZ_LANGUAGES.reduce<Record<string, QuizLanguage>>((acc, l) => {
      acc[l.code] = l;
      return acc;
    }, {}),
  );

/** Languages to surface at the top of the picker, in the configured order. */
export const POPULAR_QUIZ_LANGUAGES: ReadonlyArray<QuizLanguage> =
  POPULAR_CODES
    .map((c) => QUIZ_LANGUAGE_BY_CODE[c])
    .filter((l): l is QuizLanguage => Boolean(l));

/** Everything else, alphabetical by English name. */
export const OTHER_QUIZ_LANGUAGES: ReadonlyArray<QuizLanguage> = QUIZ_LANGUAGES
  .filter((l) => !l.popular)
  .slice()
  .sort((a, b) => a.englishName.localeCompare(b.englishName));

/**
 * Returns the language entry for a given code. Falls back to constructing
 * a minimal entry from the raw code so the AI prompt still gets something
 * usable if the DB ever holds an unknown tag.
 */
export function getQuizLanguage(code: string | null | undefined): QuizLanguage {
  const raw = (code ?? "").trim();
  if (!raw) return QUIZ_LANGUAGE_BY_CODE.fr;
  return (
    QUIZ_LANGUAGE_BY_CODE[raw] ??
    QUIZ_LANGUAGE_BY_CODE[raw.toLowerCase()] ??
    QUIZ_LANGUAGE_BY_CODE[raw.split("-")[0]?.toLowerCase() ?? ""] ?? {
      code: raw,
      nativeName: raw,
      englishName: raw,
    }
  );
}

/**
 * Human-readable label injected into AI prompts.
 * Format: `English name (Native name)` — gives the model both signals.
 * Example: "Japanese (日本語)".
 */
export function formatQuizLanguageForPrompt(code: string | null | undefined): string {
  const l = getQuizLanguage(code);
  if (!l.nativeName || l.nativeName === l.englishName) return l.englishName;
  return `${l.englishName} (${l.nativeName})`;
}

/**
 * Multi-line directive for AI prompts that captures both the language and
 * (when relevant) the regional notes. The model uses this to pick correct
 * vocabulary, idioms, currency, examples — e.g. "voiture" vs "char",
 * "ordenador" vs "computadora", "pequeno-almoço" vs "café da manhã".
 */
export function buildLanguageDirective(code: string | null | undefined): string {
  const l = getQuizLanguage(code);
  const head = formatQuizLanguageForPrompt(code);
  if (!l.regionalNotes) return head;
  return `${head}. ${l.regionalNotes}`;
}
