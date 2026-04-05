// lib/pepites/translatePepite.ts
// Translates a pepite (title + body) into target languages using OpenAI
// Used by admin create endpoint (auto-translate) and backfill script

import { getOwnerOpenAI } from "@/lib/openaiClient";

const TARGET_LOCALES = ["en", "es", "it", "ar"] as const;

export type TranslatedPepite = {
  locale: string;
  title: string;
  body: string;
};

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  it: "Italian",
  ar: "Arabic",
};

/**
 * Translate a French pepite into all target languages.
 * Returns an array of translations (one per target locale).
 * Non-blocking: errors are logged, not thrown.
 */
export async function translatePepite(
  frTitle: string,
  frBody: string,
): Promise<TranslatedPepite[]> {
  const openai = getOwnerOpenAI();
  if (!openai) {
    console.warn("[translatePepite] No OpenAI API key — skipping translations");
    return [];
  }

  const results: TranslatedPepite[] = [];

  for (const locale of TARGET_LOCALES) {
    try {
      const langName = LOCALE_NAMES[locale];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are a professional translator specializing in business and entrepreneurship content.
Translate the following French text into ${langName}.

CRITICAL RULES:
- Use natural, idiomatic ${langName} — NOT word-for-word translation
- Adapt expressions, idioms and cultural references to feel native in ${langName}
- Maintain the informal, friendly tone (tutoring the reader like a mentor)
- Keep the same structure (paragraphs, line breaks, numbered lists, emojis)
- Preserve proper nouns (brand names, people names) as-is
- For Arabic: use Modern Standard Arabic with a conversational tone
- Use the correct semantic field for business/entrepreneurship in ${langName}
- ${locale === "es" ? 'Use "tú" form (informal), not "usted"' : ""}
- ${locale === "it" ? 'Use "tu" form (informal)' : ""}
- ${locale === "ar" ? 'Use masculine singular "أنت" form as default' : ""}

Return ONLY a JSON object with two fields:
{ "title": "translated title", "body": "translated body" }

Do NOT add any explanation or markdown. Return raw JSON only.`,
          },
          {
            role: "user",
            content: `Title: ${frTitle}\n\nBody:\n${frBody}`,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) continue;

      // Parse JSON response (handle potential markdown code blocks)
      const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(jsonStr);

      if (parsed.title && parsed.body) {
        results.push({
          locale,
          title: String(parsed.title).trim(),
          body: String(parsed.body).trim(),
        });
      }
    } catch (e) {
      console.error(`[translatePepite] Failed to translate to ${locale}:`, e);
    }
  }

  return results;
}

export { TARGET_LOCALES };
