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

    // Angle de copywriting suggéré (tournant côté client) — l'IA l'applique
    // s'il colle à l'esprit du post, sinon elle prend le plus pertinent.
    const ANGLE_HINT: Record<string, string> = {
      contrarian: "a counter-intuitive claim / myth-buster that challenges what the reader assumes",
      number: "lead with the strongest concrete number or stat from the post",
      social_proof: "social proof (results achieved, adoption, a credible outcome)",
      question: "an intriguing question that opens a curiosity gap",
      how: 'a concrete "how" promise (how to get the result)',
      why: 'a "why" that reframes the reader\'s belief',
    };
    const angleId = typeof body.angle === "string" ? body.angle : "";
    const angleHint = ANGLE_HINT[angleId] ?? "the angle that best fits the post";

    const system =
      `You are a senior ${lang} direct-response copywriter for a SaaS. From the post, FIRST find its single MAIN argument and the strongest concrete DATA POINT actually present (a price, number, %, duration). Then write copy for ONE social visual whose only job is to STOP the scroll and make the reader want to open the post. ` +
      `Write EVERYTHING in ${lang}, natural and idiomatic, normal sentence case (NOT Title Case). No franglais, no invented jargon.\n` +
      `HEADLINE ANGLE: favour ${angleHint}. Other angle families you may pick from if it suits the post better: counter-truth, impactful number, social proof, question, "how", "why". Always match the SPIRIT of THIS post.\n` +
      `Return STRICT JSON with exactly the keys "kicker", "headline", "accentWord", "accent", "subtitle", "cta".\n` +
      `- headline: the scroll-stopping hook in the chosen angle, max ~7 words, clear and SELF-CONTAINED. Base it ONLY on the post. NEVER invent numbers, %, multipliers or stats not in the post. No ending period, no hashtags, no emojis.\n` +
      `- accentWord: the 1-3 MOST charged consecutive words copied VERBATIM from "headline" (exact substring, NOT the whole headline) to highlight. "" if headline is very short.\n` +
      `- accent: the single strongest real DATA POINT from the post (e.g. "450 €", "3 min", "92 %") EXACTLY as written in the post. Never fabricate, round, guess or imply a figure. "" if the post contains no real figure.\n` +
      `- kicker: OPTIONAL 1-3 word micro-hook that ADDS curiosity or stakes (a proof, a tension, a promise — e.g. "SANS CB", "TESTÉ", "AVANT/APRÈS"). It must EARN its place. NEVER a bland topical label like "Prix", "Comparatif", "SaaS", "Tarification", "Marketing" — those are useless, nobody reads them. Return "" if you have nothing genuinely punchy.\n` +
      `- subtitle: ONE short sentence (max ~12 words) understood instantly on its own — the benefit or proof behind the hook. No jargon, no vague teaser.\n` +
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

    let kicker = String(parsed.kicker ?? "").trim().slice(0, 40);
    // Garde-fou : on jette les rubriques plates et sans valeur (Béné : "prix
    // saas n'a rien à faire sur un visuel"). Mieux vaut PAS de pilule qu'une
    // étiquette que personne ne lit.
    const BLAND_KICKERS = new Set([
      "prix", "tarif", "tarifs", "tarification", "comparatif", "comparaison",
      "saas", "marketing", "produit", "offre", "promo", "pricing", "price",
      "comparison", "product", "offer", "faq", "info", "actu", "news",
    ]);
    if (BLAND_KICKERS.has(kicker.toLowerCase().replace(/[.!?]+$/, "").trim())) kicker = "";
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
