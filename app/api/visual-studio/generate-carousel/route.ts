// app/api/visual-studio/generate-carousel/route.ts
//
// Génère la COPY d'un CARROUSEL (10 slides, structure hook → CTA) à partir d'un
// texte source, pour remplir les calques texte éditables du studio.
// - Clé OWNER (openai) côté serveur. Auth requise. PAS de crédits (affiliate).
// - L'IA ne produit QUE du texte : le rendu (fonds flat de marque + mise en
//   page) est fait côté studio (canvas). Aucune image IA générée ici.
// - Même garde-fous anti-"texte IA générique" que generate-copy.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { CAROUSEL_ROLES, CAROUSEL_SLIDE_COUNT, type CarouselRole } from "@/lib/visualStudio/carousel";

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

// Intention de CHAQUE slide (donnée à l'IA pour cadrer le contenu, dans l'ordre).
const ROLE_BRIEF: Record<CarouselRole, string> = {
  hook: "HOOK — a strong, controversial or curiosity-piquing one-liner, 5-10 words MAX, that makes the reader think \"wait… what?\". Use tension, surprise or a bold claim. NOT a summary of the post.",
  rehook: "REHOOK — open a loop: tease the result/payoff WITHOUT revealing it. Maximum curiosity gap, make it IMPOSSIBLE not to swipe.",
  problem: "PROBLEM — a relatable situation, instant identification (\"most people think…\", \"I used to believe…\", \"everyone makes this mistake…\").",
  value: "VALUE — exactly ONE key idea, flowing from the previous slide. Break an expectation or reveal an insight step by step. Mix a touch of story with one actionable point.",
  aha: "AHA MOMENT — the key insight / perspective shift that triggers realization. The save-worthy, screenshot line.",
  takeaway: "TAKEAWAY — 3 concrete actions the reader can apply right now, dead easy to start. Put them in `subline` as 3 short lines separated by \\n (no numbering, each under ~8 words).",
  cta: "CTA — one strong call to action (\"comment X and I'll send it\", \"follow for more\", \"save before it's gone\"). Put the action in `cta`.",
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

    const intent = String(body.intent ?? "").trim().slice(0, 4000);
    if (!intent) {
      return NextResponse.json({ ok: false, error: "Sujet manquant" }, { status: 400 });
    }
    const locale = typeof body.locale === "string" ? body.locale : "fr";
    const lang = LANG[locale] ?? "French";
    const brand = typeof body.brandName === "string" ? body.brandName.slice(0, 60) : "";

    // Brief slide-par-slide, dans l'ordre contractuel.
    const slidePlan = CAROUSEL_ROLES
      .map((role, i) => `  Slide ${i + 1} (role "${role}"): ${ROLE_BRIEF[role]}`)
      .join("\n");

    const system =
      `You are an expert copywriter and carousel designer. From the SOURCE you craft a ${CAROUSEL_SLIDE_COUNT}-slide carousel, ready to post, in ${lang}.\n` +
      `First read the source and extract its CENTRAL message + the key insights, then write the slides.\n` +
      `Return EXACTLY ${CAROUSEL_SLIDE_COUNT} slides, in this order and intent:\n${slidePlan}\n` +
      `PSYCHOLOGICAL TRIGGERS to weave in: curiosity gap, pattern interrupt, social proof, FOMO, contrarian ideas, quick wins.\n` +
      `WRITING STYLE: very short, punchy lines. Write like you talk. Sentence case (never Title Case). Zero fluff. Slightly dramatic, conversational tone. EACH line must create momentum toward the next — the reader should NEED to swipe.\n` +
      `ANTI-AI — BANNED: empty filler ("la différence est réelle", "découvrez", "boostez", "optimisez"), the "ce n'est pas seulement X, c'est Y" pattern, brochure verbs ("s'impose comme", "au cœur de"), long em-dashes, jargon to sound smart, bro-marketing.\n` +
      `NEVER invent a number/%/price/stat that is not in the SOURCE.\n` +
      `For EACH slide return an object {role, kicker, headline, subline, cta}:\n` +
      `- role: the role string given above (in order).\n` +
      `- kicker: OPTIONAL 1-3 word tag with real tension ("" if nothing punchy). NEVER a flat category.\n` +
      `- headline: the punch line, MAX ~8 words, no ending period, no emojis.\n` +
      `- subline: ONE short supporting line (max ~16 words) OR "" if the headline stands alone. For role "takeaway": 3 short actions separated by \\n.\n` +
      `- cta: "" for every slide EXCEPT the last "cta" slide, where it is a 2-5 word action in ${lang}.\n` +
      `Return STRICT JSON: {"slides":[ ${CAROUSEL_SLIDE_COUNT} objects in order ]}. No commentary.`;
    const userMsg = `SOURCE to turn into a carousel:\n${intent}${brand ? `\nBrand name: ${brand}` : ""}`;

    const completion = (await openai.chat.completions.create({
      ...cachingParams("visual-carousel", { temperature: 0.6 }),
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

    const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
    // On reconstruit dans l'ORDRE des rôles attendus : on prend la i-ème slide
    // renvoyée et on lui ré-impose son rôle (robuste si l'IA oublie/réordonne).
    const slides = CAROUSEL_ROLES.map((role, i) => {
      const s = (rawSlides[i] ?? {}) as Record<string, unknown>;
      const isCta = role === "cta";
      return {
        role,
        kicker: String(s.kicker ?? "").trim().slice(0, 40),
        headline: String(s.headline ?? "").trim().slice(0, 90),
        // Garde les retours à la ligne (slide takeaway), borne la longueur.
        subline: String(s.subline ?? "").replace(/\r/g, "").trim().slice(0, 220),
        cta: isCta ? String(s.cta ?? "").trim().slice(0, 40) : "",
      };
    });

    // Filet : si l'IA n'a quasiment rien produit, on échoue proprement.
    const filled = slides.filter((s) => s.headline || s.subline).length;
    if (filled < Math.ceil(CAROUSEL_SLIDE_COUNT / 2)) {
      return NextResponse.json({ ok: false, error: "Carrousel non généré" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, slides });
  } catch (e) {
    console.error("[visual-studio/generate-carousel] error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
