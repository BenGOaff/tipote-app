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
      `You analyse a social post and design ONE French social-ad visual that MATCHES the post. Voice: no-bullshit SaaS founder.\n` +
      `STEP 1 — classify the post's best visual treatment, return "format":\n` +
      `  • "data" — ONLY if the post's core is a COMPARISON of 2+ real figures present in it (prices, %, durations, counts).\n` +
      `  • "beforeAfter" — ONLY if the post tells a transformation / testimonial / clear "before → after" story.\n` +
      `  • "text" — everything else (a hook, a tip, a question, a benefit). DEFAULT to "text" if unsure.\n` +
      `STEP 2 — recommend "imageStyle" fitting the post's vibe: "photoPerson" (human, personal, emotion, story), "landscape" (aspiration, freedom), "space" (bold, futuristic, dramatic), "abstract" (clean modern, product/tech), "minimal" (calm, editorial, premium). For "data"/"beforeAfter" prefer "abstract" or "minimal".\n` +
      `STEP 3 — write the copy in ${lang}, like a human talking to a human, sentence case (never Title Case).\n` +
      `ANTI-AI — BANNED: empty/abstract filler ("la différence est réelle", "une alternative plus abordable", "découvrez", "boostez", "optimisez"); the "ce n'est pas seulement X, c'est Y" pattern; brochure verbs ("s'impose comme", "met en lumière", "au cœur de"); long dashes; jargon to sound pro; bro-marketing. Be specific and concrete.\n` +
      `NEVER invent a number/%/price/stat absent from the post. Never write "n'importe qui".\n` +
      `Slots (no repetition — each says something DIFFERENT):\n` +
      `- headline: scroll-stopping HOOK, MAX 6 words, matching the post's spirit. NO number/price inside (the accent shows it). No ending period, no emojis.\n` +
      `- accent: the ONE strongest real figure/comparison from the post (e.g. "9 € vs 50 €", "3 min"), exactly as written. "" if no real figure, or if format is "data"/"beforeAfter".\n` +
      `- accentWord: 1-3 words copied VERBATIM from headline to highlight. "" if headline short.\n` +
      `- subtitle: ONE line (max ~11 words) adding NEW concrete info. Must NOT restate headline nor repeat the figure.\n` +
      `- kicker: OPTIONAL 1-3 word tag with real tension/proof ("TESTÉ", "SANS CB"). NEVER a flat category ("Prix", "Comparatif", "SaaS"). "" if nothing punchy.\n` +
      `- cta: natural 2-4 word action in ${lang}, grammatically correct.\n` +
      `- stats: if format="data", an array of 2-4 items {"label": 1-2 words, "display": figure EXACTLY as in post, "value": numeric magnitude} from REAL figures; else [].\n` +
      `- before / after: if format="beforeAfter", two short HONEST contrasted phrases (max ~7 words): before = the painful old way (no brand), after = how it is with the product; else "".\n` +
      `Return STRICT JSON with exactly: format, imageStyle, kicker, headline, accentWord, accent, subtitle, cta, stats, before, after. No commentary.`;
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

    // Données du graphe : on ne garde que des chiffres RÉELS du post
    // (anti-invention) et au moins 2 items pour comparer.
    let stats: { label: string; display: string; value: number }[] = [];
    if (Array.isArray(parsed.stats)) {
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

    // Avant/après : deux phrases honnêtes contrastées.
    const before = String(parsed.before ?? "").trim().slice(0, 90);
    const after = String(parsed.after ?? "").trim().slice(0, 90);

    // FORMAT décidé par l'IA, réconcilié avec la matière réellement dispo :
    // pas de data sans ≥2 chiffres, pas d'avant/après sans les 2 phrases.
    const STYLES = ["photoPerson", "landscape", "abstract", "space", "minimal"];
    let format = String(parsed.format ?? "text");
    if (format === "data" && stats.length < 2) format = "text";
    else if (format === "beforeAfter" && !(before && after)) format = "text";
    if (format !== "data" && format !== "beforeAfter") format = "text";
    const imageStyle = STYLES.includes(String(parsed.imageStyle)) ? String(parsed.imageStyle) : "minimal";

    if (format === "data" || format === "beforeAfter") accent = ""; // le graphe/les panneaux portent les chiffres

    if (!headline && !subtitle && !cta) {
      return NextResponse.json({ ok: false, error: "Aucun texte généré" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true, format, imageStyle,
      kicker, headline, accentWord, accent, subtitle, cta,
      stats: format === "data" ? stats : [],
      before: format === "beforeAfter" ? before : "",
      after: format === "beforeAfter" ? after : "",
    });
  } catch (e) {
    console.error("[visual-studio/generate-copy] error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
