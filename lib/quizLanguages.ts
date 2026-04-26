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
  /** Country/region flag emoji — purely cosmetic UI hint */
  flag?: string;
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
  { code: "af", nativeName: "Afrikaans", englishName: "Afrikaans", flag: "🇿🇦" },
  { code: "sq", nativeName: "Shqip", englishName: "Albanian", flag: "🇦🇱" },
  { code: "am", nativeName: "አማርኛ", englishName: "Amharic", flag: "🇪🇹" },
  // Generic Arabic — use this when the variant doesn't matter (Modern Standard).
  { code: "ar", nativeName: "العربية", englishName: "Arabic", flag: "🇸🇦", rtl: true,
    regionalNotes: "Modern Standard Arabic (الفصحى) suitable for most Arab markets." },
  { code: "ar-EG", nativeName: "العربية (مصر)", englishName: "Arabic (Egypt)", flag: "🇪🇬", rtl: true,
    regionalNotes: "Egyptian Arabic dialect, casual tone." },
  { code: "ar-MA", nativeName: "العربية (المغرب)", englishName: "Arabic (Morocco)", flag: "🇲🇦", rtl: true,
    regionalNotes: "Moroccan Darija expressions where appropriate." },
  { code: "hy", nativeName: "Հայերեն", englishName: "Armenian", flag: "🇦🇲" },
  { code: "az", nativeName: "Azərbaycanca", englishName: "Azerbaijani", flag: "🇦🇿" },
  { code: "eu", nativeName: "Euskara", englishName: "Basque", flag: "🏴" },
  { code: "be", nativeName: "Беларуская", englishName: "Belarusian", flag: "🇧🇾" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali", flag: "🇧🇩" },
  { code: "bs", nativeName: "Bosanski", englishName: "Bosnian", flag: "🇧🇦" },
  { code: "bg", nativeName: "Български", englishName: "Bulgarian", flag: "🇧🇬" },
  { code: "my", nativeName: "မြန်မာ", englishName: "Burmese", flag: "🇲🇲" },
  { code: "ca", nativeName: "Català", englishName: "Catalan", flag: "🇪🇸" },
  { code: "zh", nativeName: "简体中文", englishName: "Chinese (Simplified)", flag: "🇨🇳",
    regionalNotes: "Simplified Chinese characters, mainland China conventions." },
  { code: "zh-TW", nativeName: "繁體中文", englishName: "Chinese (Traditional)", flag: "🇹🇼",
    regionalNotes: "Traditional Chinese characters, Taiwan/HK conventions." },
  { code: "hr", nativeName: "Hrvatski", englishName: "Croatian", flag: "🇭🇷" },
  { code: "cs", nativeName: "Čeština", englishName: "Czech", flag: "🇨🇿" },
  { code: "da", nativeName: "Dansk", englishName: "Danish", flag: "🇩🇰" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch", flag: "🇳🇱" },
  { code: "nl-BE", nativeName: "Nederlands (België)", englishName: "Dutch (Belgium / Flemish)", flag: "🇧🇪",
    regionalNotes: "Flemish vocabulary and idioms used in Belgium." },
  { code: "en", nativeName: "English", englishName: "English", flag: "🌐",
    regionalNotes: "Neutral international English." },
  { code: "en-GB", nativeName: "English (UK)", englishName: "English (British)", flag: "🇬🇧",
    regionalNotes: "British spelling and idioms (colour, organise, mate, brilliant)." },
  { code: "en-US", nativeName: "English (US)", englishName: "English (American)", flag: "🇺🇸",
    regionalNotes: "American spelling and idioms (color, organize, awesome)." },
  { code: "en-AU", nativeName: "English (Australia)", englishName: "English (Australian)", flag: "🇦🇺",
    regionalNotes: "Australian English, casual register." },
  { code: "et", nativeName: "Eesti", englishName: "Estonian", flag: "🇪🇪" },
  { code: "fil", nativeName: "Filipino", englishName: "Filipino", flag: "🇵🇭" },
  { code: "fi", nativeName: "Suomi", englishName: "Finnish", flag: "🇫🇮" },
  { code: "fr", nativeName: "Français", englishName: "French", flag: "🇫🇷",
    regionalNotes: "French from France: standard metropolitan French." },
  { code: "fr-BE", nativeName: "Français (Belgique)", englishName: "French (Belgium)", flag: "🇧🇪",
    regionalNotes: "Belgian French expressions where natural." },
  { code: "fr-CA", nativeName: "Français (Canada)", englishName: "French (Canadian)", flag: "🇨🇦",
    regionalNotes: "Quebec French vocabulary and turns of phrase." },
  { code: "fr-CH", nativeName: "Français (Suisse)", englishName: "French (Switzerland)", flag: "🇨🇭",
    regionalNotes: "Swiss French — septante / nonante etc." },
  { code: "gl", nativeName: "Galego", englishName: "Galician", flag: "🇪🇸" },
  { code: "ka", nativeName: "ქართული", englishName: "Georgian", flag: "🇬🇪" },
  { code: "de", nativeName: "Deutsch", englishName: "German", flag: "🇩🇪",
    regionalNotes: "Standard High German for Germany." },
  { code: "de-AT", nativeName: "Deutsch (Österreich)", englishName: "German (Austria)", flag: "🇦🇹",
    regionalNotes: "Austrian German vocabulary." },
  { code: "de-CH", nativeName: "Deutsch (Schweiz)", englishName: "German (Switzerland)", flag: "🇨🇭",
    regionalNotes: "Swiss German written conventions (no ß, etc.)." },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek", flag: "🇬🇷" },
  { code: "gu", nativeName: "ગુજરાતી", englishName: "Gujarati", flag: "🇮🇳" },
  { code: "ha", nativeName: "Hausa", englishName: "Hausa", flag: "🇳🇬" },
  { code: "he", nativeName: "עברית", englishName: "Hebrew", flag: "🇮🇱", rtl: true },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", flag: "🇮🇳" },
  { code: "hu", nativeName: "Magyar", englishName: "Hungarian", flag: "🇭🇺" },
  { code: "is", nativeName: "Íslenska", englishName: "Icelandic", flag: "🇮🇸" },
  { code: "ig", nativeName: "Igbo", englishName: "Igbo", flag: "🇳🇬" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian", flag: "🇮🇩" },
  { code: "ga", nativeName: "Gaeilge", englishName: "Irish", flag: "🇮🇪" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", flag: "🇮🇹" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", flag: "🇯🇵" },
  { code: "kn", nativeName: "ಕನ್ನಡ", englishName: "Kannada", flag: "🇮🇳" },
  { code: "kk", nativeName: "Қазақша", englishName: "Kazakh", flag: "🇰🇿" },
  { code: "km", nativeName: "ខ្មែរ", englishName: "Khmer", flag: "🇰🇭" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", flag: "🇰🇷" },
  { code: "ky", nativeName: "Кыргызча", englishName: "Kyrgyz", flag: "🇰🇬" },
  { code: "lo", nativeName: "ລາວ", englishName: "Lao", flag: "🇱🇦" },
  { code: "lv", nativeName: "Latviešu", englishName: "Latvian", flag: "🇱🇻" },
  { code: "lt", nativeName: "Lietuvių", englishName: "Lithuanian", flag: "🇱🇹" },
  { code: "lb", nativeName: "Lëtzebuergesch", englishName: "Luxembourgish", flag: "🇱🇺" },
  { code: "mk", nativeName: "Македонски", englishName: "Macedonian", flag: "🇲🇰" },
  { code: "mg", nativeName: "Malagasy", englishName: "Malagasy", flag: "🇲🇬" },
  { code: "ms", nativeName: "Bahasa Melayu", englishName: "Malay", flag: "🇲🇾" },
  { code: "ml", nativeName: "മലയാളം", englishName: "Malayalam", flag: "🇮🇳" },
  { code: "mt", nativeName: "Malti", englishName: "Maltese", flag: "🇲🇹" },
  { code: "mr", nativeName: "मराठी", englishName: "Marathi", flag: "🇮🇳" },
  { code: "mn", nativeName: "Монгол", englishName: "Mongolian", flag: "🇲🇳" },
  { code: "ne", nativeName: "नेपाली", englishName: "Nepali", flag: "🇳🇵" },
  { code: "no", nativeName: "Norsk", englishName: "Norwegian", flag: "🇳🇴" },
  { code: "ps", nativeName: "پښتو", englishName: "Pashto", flag: "🇦🇫", rtl: true },
  { code: "fa", nativeName: "فارسی", englishName: "Persian", flag: "🇮🇷", rtl: true },
  { code: "pl", nativeName: "Polski", englishName: "Polish", flag: "🇵🇱" },
  // Two distinct Portuguese variants — see the user feedback that triggered this.
  { code: "pt", nativeName: "Português (Portugal)", englishName: "Portuguese (Portugal)", flag: "🇵🇹",
    regionalNotes: "European Portuguese: orthography and vocabulary from Portugal (e.g. 'autocarro', 'pequeno-almoço'). Avoid Brazilian gerundivos." },
  { code: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazilian)", flag: "🇧🇷",
    regionalNotes: "Brazilian Portuguese: warm, informal register typical of BR marketing (você, gerundivos, R$)." },
  { code: "pa", nativeName: "ਪੰਜਾਬੀ", englishName: "Punjabi", flag: "🇮🇳" },
  { code: "ro", nativeName: "Română", englishName: "Romanian", flag: "🇷🇴" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", flag: "🇷🇺" },
  { code: "sr", nativeName: "Српски", englishName: "Serbian", flag: "🇷🇸" },
  { code: "si", nativeName: "සිංහල", englishName: "Sinhala", flag: "🇱🇰" },
  { code: "sk", nativeName: "Slovenčina", englishName: "Slovak", flag: "🇸🇰" },
  { code: "sl", nativeName: "Slovenščina", englishName: "Slovenian", flag: "🇸🇮" },
  { code: "so", nativeName: "Soomaali", englishName: "Somali", flag: "🇸🇴" },
  { code: "es", nativeName: "Español (España)", englishName: "Spanish (Spain)", flag: "🇪🇸",
    regionalNotes: "Castilian Spanish from Spain (vosotros, ordenador, móvil, €)." },
  { code: "es-MX", nativeName: "Español (México)", englishName: "Spanish (Mexico)", flag: "🇲🇽",
    regionalNotes: "Mexican Spanish (computadora, celular, MXN)." },
  { code: "es-AR", nativeName: "Español (Argentina)", englishName: "Spanish (Argentina)", flag: "🇦🇷",
    regionalNotes: "Argentinian Spanish — voseo, ARS." },
  { code: "es-CO", nativeName: "Español (Colombia)", englishName: "Spanish (Colombia)", flag: "🇨🇴" },
  { code: "es-CL", nativeName: "Español (Chile)", englishName: "Spanish (Chile)", flag: "🇨🇱" },
  { code: "sw", nativeName: "Kiswahili", englishName: "Swahili", flag: "🇰🇪" },
  { code: "sv", nativeName: "Svenska", englishName: "Swedish", flag: "🇸🇪" },
  { code: "tg", nativeName: "Тоҷикӣ", englishName: "Tajik", flag: "🇹🇯" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil", flag: "🇮🇳" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu", flag: "🇮🇳" },
  { code: "th", nativeName: "ไทย", englishName: "Thai", flag: "🇹🇭" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", flag: "🇹🇷" },
  { code: "uk", nativeName: "Українська", englishName: "Ukrainian", flag: "🇺🇦" },
  { code: "ur", nativeName: "اردو", englishName: "Urdu", flag: "🇵🇰", rtl: true },
  { code: "uz", nativeName: "Oʻzbekcha", englishName: "Uzbek", flag: "🇺🇿" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", flag: "🇻🇳" },
  { code: "cy", nativeName: "Cymraeg", englishName: "Welsh", flag: "🏴" },
  { code: "yo", nativeName: "Yorùbá", englishName: "Yoruba", flag: "🇳🇬" },
  { code: "zu", nativeName: "isiZulu", englishName: "Zulu", flag: "🇿🇦" },
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
