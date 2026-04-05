// scripts/translate-pepites.cjs
// Backfill translations for all existing FR pepites that don't have translations yet.
//
// Usage:
//   node scripts/translate-pepites.cjs
//   node scripts/translate-pepites.cjs --locale en    # translate only to English
//   node scripts/translate-pepites.cjs --dry-run      # preview without writing
//
// Requires:
// - NEXT_PUBLIC_SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - OPENAI_API_KEY_OWNER (or OPENAI_API_KEY)

require("dotenv").config({ path: ".env.production.local" });
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai").default;

const TARGET_LOCALES = ["en", "es", "it", "ar"];
const LOCALE_NAMES = { en: "English", es: "Spanish", it: "Italian", ar: "Arabic" };

function getEnv(name, fallback) {
  const v = process.env[name] || (fallback ? process.env[fallback] : undefined);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function translateOne(openai, title, body, locale) {
  const langName = LOCALE_NAMES[locale];
  const extraRules = {
    es: 'Use "tú" form (informal), not "usted".',
    it: 'Use "tu" form (informal).',
    ar: 'Use masculine singular "أنت" form as default.',
  };

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
${extraRules[locale] ? `- ${extraRules[locale]}` : ""}

Return ONLY a JSON object with two fields:
{ "title": "translated title", "body": "translated body" }

Do NOT add any explanation or markdown. Return raw JSON only.`,
      },
      {
        role: "user",
        content: `Title: ${title}\n\nBody:\n${body}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty response from OpenAI");

  const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(jsonStr);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const localeFilter = args.find((a, i) => args[i - 1] === "--locale");
  const targetLocales = localeFilter ? [localeFilter] : TARGET_LOCALES;

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = getEnv("OPENAI_API_KEY_OWNER", "OPENAI_API_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const openai = new OpenAI({ apiKey: openaiKey });

  // 1. Ensure all FR pepites have group_key set
  const { data: frPepites, error: frErr } = await supabase
    .from("pepites")
    .select("id, title, body, group_key, locale")
    .eq("locale", "fr")
    .order("created_at", { ascending: true });

  if (frErr) throw new Error(`Failed to fetch FR pepites: ${frErr.message}`);
  if (!frPepites || frPepites.length === 0) {
    console.log("[translate] No FR pepites found.");
    return;
  }

  console.log(`[translate] Found ${frPepites.length} FR pepites`);

  // Set group_key for any that don't have it
  for (const p of frPepites) {
    if (!p.group_key) {
      if (!dryRun) {
        await supabase.from("pepites").update({ group_key: p.id }).eq("id", p.id);
      }
      p.group_key = p.id;
    }
  }

  // 2. Find which translations are missing
  const { data: existing } = await supabase
    .from("pepites")
    .select("group_key, locale")
    .in("locale", targetLocales);

  const existingSet = new Set((existing ?? []).map((e) => `${e.group_key}:${e.locale}`));

  const toTranslate = [];
  for (const p of frPepites) {
    for (const locale of targetLocales) {
      if (!existingSet.has(`${p.group_key}:${locale}`)) {
        toTranslate.push({ ...p, targetLocale: locale });
      }
    }
  }

  console.log(`[translate] ${toTranslate.length} translations needed (${targetLocales.join(", ")})`);

  if (dryRun) {
    console.log("[translate] Dry run — not writing anything.");
    for (const t of toTranslate.slice(0, 5)) {
      console.log(`  - "${t.title}" → ${t.targetLocale}`);
    }
    if (toTranslate.length > 5) console.log(`  ... and ${toTranslate.length - 5} more`);
    return;
  }

  // 3. Translate
  let done = 0;
  let errors = 0;

  for (const item of toTranslate) {
    try {
      const translated = await translateOne(openai, item.title, item.body, item.targetLocale);

      const { error: upsertErr } = await supabase.from("pepites").upsert(
        {
          title: translated.title,
          body: translated.body,
          locale: item.targetLocale,
          group_key: item.group_key,
        },
        { onConflict: "group_key,locale" },
      );

      if (upsertErr) {
        console.error(`[translate] DB error for "${item.title}" → ${item.targetLocale}: ${upsertErr.message}`);
        errors++;
        continue;
      }

      done++;
      console.log(`[translate] ${done}/${toTranslate.length} ✓ "${item.title}" → ${item.targetLocale}`);

      // Rate limiting: 200ms between calls
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      errors++;
      console.error(`[translate] Failed "${item.title}" → ${item.targetLocale}:`, e.message || e);
    }
  }

  console.log(`\n[translate] Done! ${done} translated, ${errors} errors.`);
}

main().catch((err) => {
  console.error("[translate] FATAL:", err);
  process.exit(1);
});
