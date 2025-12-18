// app/api/content/generate/route.ts
// Génération IA + sauvegarde dans content_item (sans toucher au flow auth/onboarding/magic link)
// V2 : utilise la clé OpenAI utilisateur si configurée (sinon fallback owner key)
//
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee)
// -> on tente d'abord l'INSERT v2 (title/content/status/channel/scheduled_date), sinon fallback FR.

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getDecryptedUserApiKey } from "@/lib/userApiKeys";

type Body = {
  type?: string;
  channel?: string;
  scheduledDate?: string | null; // YYYY-MM-DD
  tags?: string[];
  prompt?: string;

  // fallback compat (au cas où le front a un autre champ)
  brief?: string;
  consigne?: string;
  angle?: string;
  text?: string;
};

type InsertedRow = { id: string };

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isMissingColumnError(message: string | undefined | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") && m.includes("column");
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
    const tags = Array.isArray(body?.tags) ? body.tags.filter(Boolean).map(String) : [];

    const prompt =
      safeString(body?.prompt).trim() ||
      safeString(body?.brief).trim() ||
      safeString(body?.consigne).trim() ||
      safeString(body?.angle).trim() ||
      safeString(body?.text).trim();

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
      .select("plan_json")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const planJson: unknown = plan?.plan_json ?? null;

    // Resolve OpenAI key: user key first (encrypted), else owner key
    let apiKey: string | null = null;

    if (process.env.TIPOTE_KEYS_ENCRYPTION_KEY) {
      apiKey = await getDecryptedUserApiKey({
        supabase,
        userId: session.user.id,
        provider: "openai",
      });
    }

    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY_OWNER || process.env.OPENAI_API_KEY || "";
    }

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OpenAI API key (user key or OPENAI_API_KEY_OWNER/OPENAI_API_KEY)" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const system = [
      "Tu es Tipote™, un assistant expert en création de contenu pour entrepreneurs.",
      "Tu produis un contenu directement utilisable, concret, structuré, sans bla-bla.",
      "Réponds en français.",
    ].join("\n");

    const user = [
      "Contexte entreprise (profil) :",
      profile ? JSON.stringify(profile) : "Aucun profil.",
      "",
      "Business plan (si disponible) :",
      planJson ? JSON.stringify(planJson) : "Aucun plan.",
      "",
      "Type de contenu : " + type,
      channel ? "Canal : " + channel : "",
      scheduledDate ? "Date planifiée : " + scheduledDate : "",
      tags.length ? "Tags : " + tags.join(", ") : "",
      "",
      "Brief / consigne :",
      prompt,
      "",
      "Donne uniquement le contenu final. Pas de meta-explications.",
    ]
      .filter(Boolean)
      .join("\n");

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content = resp?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!content) {
      return NextResponse.json({ ok: false, error: "Empty response from model" }, { status: 500 });
    }

    // Sauvegarde content_item
    // - v2 schema attempt, then fallback FR schema if needed
    const insertV2 = await supabase
      .from("content_item")
      .insert({
        user_id: session.user.id,
        type,
        title: null,
        status: "draft",
        channel,
        scheduled_date: scheduledDate,
        tags,
        prompt,
        content,
      })
      .select("id")
      .single();

    let inserted: InsertedRow | null = insertV2.data ?? null;
    let insErr: PostgrestError | null = insertV2.error ?? null;

    if (insErr && isMissingColumnError(insErr.message)) {
      const insertFR = await supabase
        .from("content_item")
        .insert({
          user_id: session.user.id,
          type,
          titre: null,
          statut: "draft",
          canal: channel,
          date_planifiee: scheduledDate,
          tags: tags.join(","), // legacy FR schema uses text
          contenu: content,
        })
        .select("id")
        .single();

      inserted = insertFR.data ?? null;
      insErr = insertFR.error ?? null;
    }

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        id: inserted?.id ?? null,
        content,
        usedUserKey:
          Boolean(process.env.TIPOTE_KEYS_ENCRYPTION_KEY) &&
          Boolean(apiKey && apiKey !== (process.env.OPENAI_API_KEY_OWNER || process.env.OPENAI_API_KEY || "")),
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
