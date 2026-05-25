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
      `You are an expert social-media copywriter. Write punchy, scroll-stopping copy for a single social visual. ` +
      `Write EVERYTHING in ${lang}. Return STRICT JSON with exactly the keys "kicker", "headline", "subtitle", "cta".\n` +
      `- kicker: a tiny 1-3 word category/context label (e.g. a theme or rubric), UPPERCASE-friendly, no emojis.\n` +
      `- headline: a stop-scroll hook, max ~6 words, benefit or curiosity driven, no ending period, no hashtags, no emojis.\n` +
      `- subtitle: one short supporting line, max ~12 words — phrase it like a hand-written hook (a question or a teaser).\n` +
      `- cta: a 2-4 word action call suitable for a button.\n` +
      `No extra keys, no commentary.`;
    const userMsg = `Topic / context of the visual: ${intent}${brand ? `\nBrand: ${brand}` : ""}`;

    const completion = (await openai.chat.completions.create({
      ...cachingParams("visual-copy", { temperature: 0.9 }),
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
    const subtitle = String(parsed.subtitle ?? "").trim().slice(0, 160);
    const cta = String(parsed.cta ?? "").trim().slice(0, 40);

    if (!headline && !subtitle && !cta) {
      return NextResponse.json({ ok: false, error: "Aucun texte généré" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, kicker, headline, subtitle, cta });
  } catch (e) {
    console.error("[visual-studio/generate-copy] error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
