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
    // Gabarit "data-viz" : on demande EN PLUS un jeu de données comparables.
    const wantStats = body.template === "data";
    const statsClause = wantStats
      ? `\nDATA: also return "stats" — an array of 2 to 4 comparable items to chart, taken ONLY from REAL figures in the post. Each item: {"label": 1-2 word category (e.g. "Tiquiz", "Typeform"), "display": the figure EXACTLY as in the post (e.g. "9 €", "50 €"), "value": its numeric magnitude as a number (e.g. 9, 50) for the bar height}. If the post has no 2+ comparable real figures, return "stats": []. In data mode set "accent" to "" (the chart shows the figures).`
      : "";

    const system =
      `You write ONE French social-ad visual in the voice of a no-bullshit SaaS founder. From the post, find its ONE main argument and the single strongest REAL figure it contains (price, %, duration…). Goal: stop the scroll, make people want to read the post.\n` +
      `Write in ${lang}, like a human talking to a human. Sentence case, never Title Case.\n` +
      `ANTI-AI — these make copy sound fake, BANNED: empty/abstract filler ("la différence est réelle", "une alternative plus abordable", "découvrez", "boostez", "optimisez", "passez au niveau supérieur"); the "ce n'est pas seulement X, c'est Y" pattern; brochure verbs ("s'impose comme", "met en lumière", "au cœur de", "révèle"); long dashes; jargon used to sound pro; bro-marketing. Be specific and concrete — every word earns its place, or cut it.\n` +
      `NEVER invent a number/%/price/stat that is not in the post. Never write "n'importe qui".\n` +
      `NO REPETITION between slots — each says something DIFFERENT:\n` +
      `- accent: the ONE strongest real figure or tight comparison from the post (e.g. "9 € vs 50 €", "3 min", "92 %"), exactly as written. This is the ONLY place a number may appear. "" if the post has no real figure.\n` +
      `- headline: the scroll-stopping HOOK, MAX 6 words, using the angle below. It must contain NO number/price (the accent already shows it). Self-contained, no ending period, no emojis.\n` +
      `- subtitle: ONE line (max ~11 words) adding NEW concrete info — a real benefit or proof. It must NOT restate the headline's idea NOR repeat the accent figure.\n` +
      `- kicker: OPTIONAL 1-3 word tag with real tension or proof (e.g. "TESTÉ", "SANS CB"). NEVER a flat category ("Prix", "Comparatif", "SaaS", "Tarification"). "" if nothing punchy.\n` +
      `- accentWord: 1-3 words copied VERBATIM from headline to highlight (exact substring, not the whole headline). "" if headline is short.\n` +
      `- cta: natural 2-4 word action in ${lang}, grammatically correct (e.g. "Tester gratuitement", "Commencer maintenant").\n` +
      `HEADLINE ANGLE: favour ${angleHint} — but always match the spirit of THIS post.${statsClause}\n` +
      `Return STRICT JSON with exactly these keys: kicker, headline, accentWord, accent, subtitle, cta${wantStats ? ", stats" : ""}. No commentary.`;
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
    // Anti-DOUBLON de chiffre : si le titre contient déjà un nombre, on NE
    // montre PAS le badge accent (sinon le même chiffre apparaît 2× — défaut
    // signalé par Béné). Le chiffre reste là où l'IA l'a mis (le titre).
    if (accent && /\d/.test(headline)) {
      accent = "";
    }
    // L'accentWord doit être un VRAI extrait du titre (sinon impossible de le
    // surligner) et pas le titre entier (sinon titre 100% coloré, peu lisible).
    if (accentWord) {
      const inHeadline = headline.toLowerCase().includes(accentWord.toLowerCase());
      const isWhole = accentWord.length >= headline.trim().length;
      if (!inHeadline || isWhole) accentWord = "";
    }

    // Données du graphe (mode data-viz) : on ne garde que des chiffres RÉELS
    // du post (anti-invention) et au moins 2 items pour comparer.
    let stats: { label: string; display: string; value: number }[] = [];
    if (wantStats && Array.isArray(parsed.stats)) {
      stats = (parsed.stats as unknown[])
        .slice(0, 4)
        .map((raw) => {
          const s = (raw ?? {}) as Record<string, unknown>;
          return {
            label: String(s.label ?? "").trim().slice(0, 24),
            display: String(s.display ?? "").trim().slice(0, 16),
            value: Number(s.value),
          };
        })
        .filter((s) => s.label && s.display && Number.isFinite(s.value) && s.value > 0)
        .filter((s) => (s.display.match(/\d+/g) ?? []).every((d) => intent.includes(d)));
      if (stats.length < 2) stats = [];
    }
    if (stats.length) accent = ""; // le graphe porte les chiffres, pas le badge

    if (!headline && !subtitle && !cta) {
      return NextResponse.json({ ok: false, error: "Aucun texte généré" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, kicker, headline, accentWord, accent, subtitle, cta, stats });
  } catch (e) {
    console.error("[visual-studio/generate-copy] error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
