// app/api/visual-studio/generate-copy/route.ts
//
// Génère la COPY du visuel (titre stop-scroll + sous-titre + CTA) à partir
// d'un sujet, pour remplir les calques texte éditables du studio.
// - Clé OWNER (openai) côté serveur. Auth requise. PAS de crédits (affiliate).
// - Le texte est ensuite injecté dans les calques (éditable) — l'IA ne pose
//   JAMAIS le texte sur l'image elle-même.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LANG: Record<string, string> = {
  fr: "French",
  en: "English",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  "pt-BR": "Brazilian Portuguese",
  ar: "Arabic",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!openai) {
      return NextResponse.json({ ok: false, error: "AI non configurée (clé manquante)." }, { status: 503 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const intent = String(body.intent ?? "").trim().slice(0, 500);
    if (!intent) {
      return NextResponse.json({ ok: false, error: "Sujet manquant" }, { status: 400 });
    }
    const locale = typeof body.locale === "string" ? body.locale : "fr";
    const lang = LANG[locale] ?? "French";
    const brand = typeof body.brandName === "string" ? body.brandName.slice(0, 60) : "";

    const system =
      `You are a senior ${lang} social-media copywriter for a SaaS product. Write clear, punchy copy for ONE social visual, based STRICTLY on the user's post — never add facts that aren't there. ` +
      `Write EVERYTHING in ${lang}, natural and idiomatic, in normal sentence case (do NOT Capitalize Every Word). No franglais, no invented jargon, no buzzwords like "funneling". ` +
      `Return STRICT JSON with exactly the keys "kicker", "headline", "accentWord", "accent", "subtitle", "cta".\n` +
      `- kicker: a SHORT real category label (1-3 words) in ${lang}, like a magazine rubric. Real, common words only — no invented terms, and not in English unless the language is English.\n` +
      `- headline: the main hook, max ~6 words, clear and SELF-CONTAINED (a stranger understands it with no other context). Base it ONLY on the post. NEVER invent numbers, percentages, multipliers (like "7x"), statistics or prices. No ending period, no hashtags, no emojis.\n` +
      `- accentWord: the 1-3 MOST important consecutive words copied VERBATIM from "headline" (must be an exact substring of headline), to be highlighted in the brand color. Pick the words carrying the core idea. Do NOT return the whole headline; if headline is very short, return its strongest single word.\n` +
      `- accent: MUST be an empty string "" UNLESS the post text literally contains a real figure (a price, number or stat). If it does, output EXACTLY that figure (e.g. "9 €/mois", "16 365 €"). Never fabricate, guess, round or imply a figure. A lone number with no meaning (like "4,2 %") is forbidden. When unsure, return "".\n` +
      `- subtitle: ONE short sentence (max ~12 words) that is instantly understandable on its own — a concrete benefit or a clear question. No jargon, no vague teaser.\n` +
      `- cta: a 2-4 word button action in ${lang}.\n` +
      `No extra keys, no commentary.`;
    const userMsg = `The post to adapt into a visual:\n${intent}${brand ? `\nBrand name: ${brand}` : ""}`;

    const completion = (await openai.chat.completions.create({
      ...cachingParams("visual-copy", { temperature: 0.5 }),
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    } as Parameters<typeof openai.chat.completions.create>[0])) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim());
    } catch {
      parsed = {};
    }

    const kicker = String(parsed.kicker ?? "").trim().slice(0, 40);
    const headline = String(parsed.headline ?? "").trim().slice(0, 80);
    let accentWord = String(parsed.accentWord ?? "").trim().slice(0, 40);
    let accent = String(parsed.accent ?? "").trim().slice(0, 24);
    const subtitle = String(parsed.subtitle ?? "").trim().slice(0, 160);
    const cta = String(parsed.cta ?? "").trim().slice(0, 40);

    // Garde-fou anti-statistique inventée : si l'accent contient un nombre qui
    // n'apparaît PAS tel quel dans le post, c'est une invention → on le jette
    // (ex. "4,2 %" sorti de nulle part). Les accents sans chiffre passent.
    const accentDigitGroups = accent.match(/\d+/g) ?? [];
    if (accentDigitGroups.some((d) => !intent.includes(d))) {
      accent = "";
    }
    // L'accentWord doit être un VRAI extrait du titre (sinon impossible de le
    // surligner) et pas le titre entier (sinon titre 100% coloré, peu lisible).
    if (accentWord) {
      const inHeadline = headline.toLowerCase().includes(accentWord.toLowerCase());
      const isWhole = accentWord.length >= headline.trim().length;
      if (!inHeadline || isWhole) accentWord = "";
    }

    if (!headline && !subtitle && !cta) {
      return NextResponse.json({ ok: false, error: "Aucun texte généré" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, kicker, headline, accentWord, accent, subtitle, cta });
  } catch (e) {
    console.error("[visual-studio/generate-copy] error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
