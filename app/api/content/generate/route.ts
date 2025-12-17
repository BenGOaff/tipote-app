// app/api/content/generate/route.ts
// Génération IA + sauvegarde dans content_item (sans toucher au flow auth/onboarding/magic link)
// V2 : utilise la clé OpenAI utilisateur si configurée (sinon fallback owner key)

import { NextResponse } from "next/server";
import OpenAI from "openai";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getDecryptedUserApiKey } from "@/lib/userApiKeys";

type Body = {
  type: string;
  channel?: string;
  scheduledDate?: string | null; // YYYY-MM-DD
  tags?: string[];
  prompt: string;
};

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;

    const type = safeString(body?.type).trim();
    const channel = safeString(body?.channel).trim() || null;
    const scheduledDate = body?.scheduledDate ?? null;
    const tags = Array.isArray(body?.tags) ? body.tags : [];
    const prompt = safeString(body?.prompt).trim();

    if (!type || !prompt) {
      return NextResponse.json({ ok: false, error: "Missing type or prompt" }, { status: 400 });
    }

    // Récup contexte user (profil + plan)
    const { data: profile } = await supabase
      .from("business_profile")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const { data: plan } = await supabase
      .from("business_plan")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const context = {
      type,
      channel,
      scheduledDate,
      tags,
      business_profile: profile ?? null,
      business_plan: plan ?? null,
    };

    // 1) Clé user (si chiffrement + table configurés)
    let apiKey =
      process.env.TIPOTE_KEYS_ENCRYPTION_KEY
        ? await getDecryptedUserApiKey({
            supabase,
            userId: session.user.id,
            provider: "openai",
          })
        : null;

    // 2) Fallback owner key (compat)
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY_OWNER || process.env.OPENAI_API_KEY || "";
    }

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OpenAI API key (user key or OPENAI_API_KEY_OWNER/OPENAI_API_KEY)" },
        { status: 500 },
      );
    }

    const client = new OpenAI({ apiKey });

    const system = [
      "Tu es Tipote™, un assistant expert en création de contenu business pour entrepreneurs.",
      "Tu produis une sortie directement exploitable, structurée, en français.",
      "Tu respectes le format demandé par l'utilisateur et le type de contenu.",
    ].join("\n");

    const user = [
      "CONTEXTE (JSON):",
      JSON.stringify(context, null, 2),
      "",
      "DEMANDE:",
      prompt,
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content = completion.choices?.[0]?.message?.content ?? "";
    if (!content) {
      return NextResponse.json({ ok: false, error: "Empty response from model" }, { status: 500 });
    }

    // Sauvegarde content_item
    const { data: inserted, error: insErr } = await supabase
      .from("content_item")
      .insert({
        user_id: session.user.id,
        type,
        title: null,
        status: "draft",
        channel,
        scheduled_date: scheduledDate,
        tags,
        content,
      })
      .select("id")
      .single();

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        id: inserted?.id ?? null,
        content,
        usedUserKey: Boolean(process.env.TIPOTE_KEYS_ENCRYPTION_KEY) && Boolean(await getDecryptedUserApiKey({ supabase, userId: session.user.id, provider: "openai" })),
      },
      { status: 200 },
    );
  } catch (e) {
    console.error("[POST /api/content/generate] error", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
