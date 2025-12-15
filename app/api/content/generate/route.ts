// app/api/content/generate/route.ts
// Génération IA + sauvegarde dans content_item (sans toucher au flow auth/onboarding/magic link)

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type Body = {
  type: string;
  channel?: string;
  scheduledDate?: string | null; // "YYYY-MM-DD"
  tags?: string[];
  prompt: string;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeType(t: string): string {
  const v = (t || "").trim().toLowerCase();
  // on garde des slugs simples; côté DB, on stocke le slug
  return v || "generic";
}

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const type = normalizeType(safeString(body.type));
    const channel = safeString(body.channel) || "Général";
    const scheduledDate = body.scheduledDate ?? null;
    const tags = Array.isArray(body.tags) ? body.tags.filter(Boolean).slice(0, 20) : [];
    const prompt = safeString(body.prompt).trim();

    if (!prompt) {
      return NextResponse.json({ ok: false, error: "Missing prompt" }, { status: 400 });
    }

    // Contexte: business_profile + business_plan (si dispo), sans casser si absent
    const [{ data: profile }, { data: plan }] = await Promise.all([
      supabase
        .from("business_profile")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("business_plan")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const system = [
      "Tu es un assistant copywriter + stratège pour entrepreneurs.",
      "Ta réponse doit être directement utilisable, sans blabla.",
      "Adapte le ton au contexte business et à l'objectif.",
      "Si des infos manquent, fais des hypothèses raisonnables et reste cohérent.",
      "Format: texte prêt à copier-coller.",
    ].join("\n");

    const context = {
      type,
      channel,
      scheduledDate,
      tags,
      business_profile: profile ?? null,
      business_plan: plan ?? null,
    };

    // Clé : pour ne pas casser l’existant, on réutilise la clé owner (fallback OPENAI_API_KEY).
    const apiKey = process.env.OPENAI_API_KEY_OWNER || process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OpenAI API key (OPENAI_API_KEY_OWNER or OPENAI_API_KEY)" },
        { status: 500 },
      );
    }

    const openai = new OpenAI({ apiKey });

    const userPrompt = [
      `TYPE: ${type}`,
      `CANAL: ${channel}`,
      scheduledDate ? `DATE PLANIFIEE: ${scheduledDate}` : "DATE PLANIFIEE: (non renseignée)",
      tags.length ? `TAGS: ${tags.join(", ")}` : "TAGS: (aucun)",
      "",
      "CONTEXTE (JSON):",
      JSON.stringify(context),
      "",
      "CONSIGNE UTILISATEUR:",
      prompt,
      "",
      "INSTRUCTIONS:",
      "- Produis un contenu final prêt à publier.",
      "- Ajoute une variante courte si pertinent (ex: hook alternatif).",
      "- Garde le format adapté au canal.",
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content?.trim() || "";
    if (!content) {
      return NextResponse.json({ ok: false, error: "Empty generation" }, { status: 500 });
    }

    const titleBase = `${type}`.replace(/[_-]+/g, " ").trim();
    const title = `${titleBase.charAt(0).toUpperCase()}${titleBase.slice(1)} — ${content
      .slice(0, 48)
      .replace(/\s+/g, " ")
      .trim()}${content.length > 48 ? "…" : ""}`;

    const status = scheduledDate ? "planned" : "draft";

    // Sauvegarde
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      type,
      title,
      prompt,
      content,
      status,
      scheduled_date: scheduledDate,
      channel,
      tags,
      ai_provider_used: "openai-owner",
    };

    const { data: saved, error: saveErr } = await supabase
      .from("content_item")
      .insert(insertPayload)
      .select("id, title")
      .single();

    if (saveErr) {
      // On renvoie quand même le contenu si la DB bloque (RLS/colonne), pour ne pas casser l’UX.
      return NextResponse.json(
        {
          ok: true,
          title,
          content,
          warning: "Generated but not saved",
          saveError: saveErr.message,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { ok: true, id: saved?.id, title: saved?.title ?? title, content },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
