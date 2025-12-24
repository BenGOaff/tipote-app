// app/api/content/generate/route.ts
// Génération IA + sauvegarde dans content_item
// ✅ Fix compile TS (vu sur ta capture) : getDecryptedUserApiKey() retourne string|null (pas { ok, key })
// -> on NE destructure PAS, on récupère directement `userKey`
//
// ⚠️ Cohérent avec l’existant :
// - Auth Supabase server
// - Fallback sur OPENAI_API_KEY si l’utilisateur n’a pas de clé
// - On garde une réponse JSON stable { ok, id?, title?, content?, ... }

import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getDecryptedUserApiKey } from "@/lib/userApiKeys";

type Provider = "openai" | "claude" | "gemini";

type Body = {
  type?: string;
  provider?: Provider | string;
  channel?: string;
  scheduledDate?: string | null; // YYYY-MM-DD
  tags?: string[];
  prompt?: string;

  // compat (si ancien front)
  brief?: string;
  consigne?: string;
  angle?: string;
  text?: string;
};

function safeString(v: unknown) {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

function normalizeProvider(v: unknown): Provider {
  const s = safeString(v).trim().toLowerCase();
  if (s === "claude") return "claude";
  if (s === "gemini") return "gemini";
  return "openai";
}

function isoDateOrNull(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

function toCsv(tags: string[]) {
  return tags
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(", ");
}

function maskKey(key: string) {
  const s = (key ?? "").trim();
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
}

// Insert FR (schéma prod)
async function insertContentFR(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  type: string;
  title: string | null;
  content: string;
  channel: string | null;
  scheduledDate: string | null;
  tagsCsv: string;
  status: string;
}) {
  const { supabase, ...row } = params;
  const { data, error } = await supabase
    .from("content_item")
    .insert({
      user_id: row.userId,
      type_contenu: row.type,
      titre: row.title,
      contenu: row.content,
      statut: row.status,
      canal: row.channel,
      date_planifiee: row.scheduledDate,
      tags: row.tagsCsv,
    })
    .select("id, titre")
    .single();

  return { data, error };
}

// Fallback EN (anciennes envs)
async function insertContentEN(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
  type: string;
  title: string | null;
  content: string;
  channel: string | null;
  scheduledDate: string | null;
  tagsCsv: string;
  status: string;
}) {
  const { supabase, ...row } = params;
  const { data, error } = await supabase
    .from("content_item")
    .insert({
      user_id: row.userId,
      content_type: row.type,
      title: row.title,
      content: row.content,
      status: row.status,
      channel: row.channel,
      scheduled_date: row.scheduledDate,
      tags: row.tagsCsv,
    })
    .select("id, title")
    .single();

  return { data, error };
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
    const provider = normalizeProvider(body?.provider);
    const channel = safeString(body?.channel).trim() || null;
    const scheduledDate = isoDateOrNull(body?.scheduledDate ?? null);
    const tags = Array.isArray(body?.tags) ? body.tags.filter(Boolean).map(String) : [];

    const prompt =
      safeString(body?.prompt).trim() ||
      safeString(body?.brief).trim() ||
      safeString(body?.consigne).trim() ||
      safeString(body?.angle).trim() ||
      safeString(body?.text).trim();

    if (!type) {
      return NextResponse.json({ ok: false, error: "Missing type" }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ ok: false, error: "Missing prompt" }, { status: 400 });
    }

    // UI peut proposer Claude/Gemini, mais backend pas activé -> réponse propre
    if (provider !== "openai") {
      return NextResponse.json(
        { ok: false, error: `Provider "${provider}" pas encore activé côté backend.` },
        { status: 501 },
      );
    }

    // Contexte (optionnel) : business profile + plan
    const { data: profile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const { data: planRow } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const planJson = (planRow?.plan_json ?? null) as unknown;

    // ✅ Fix TS : getDecryptedUserApiKey() retourne string|null
    const ownerKey = process.env.OPENAI_API_KEY ?? "";
    const userKey = await getDecryptedUserApiKey({
      supabase,
      userId: session.user.id,
      provider: "openai",
    });

    const usedUserKey = !!userKey;
    const apiKey = (userKey ?? ownerKey).trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Aucune clé OpenAI disponible. Configure une clé utilisateur (Paramètres → IA & API) ou définis OPENAI_API_KEY côté serveur.",
        },
        { status: 400 },
      );
    }

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
      `Type de contenu : ${type}`,
      channel ? `Canal : ${channel}` : "",
      scheduledDate ? `Date planifiée : ${scheduledDate}` : "",
      tags.length ? `Tags : ${tags.join(", ")}` : "",
      "",
      "Brief :",
      prompt,
    ]
      .filter(Boolean)
      .join("\n");

    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
    });

    const content = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return NextResponse.json({ ok: false, error: "Empty AI response" }, { status: 500 });
    }

    // Titre heuristique (première ligne)
    const firstLine = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0];
    const title = firstLine && firstLine.length <= 120 ? firstLine : null;

    const status = scheduledDate ? "scheduled" : "draft";
    const tagsCsv = toCsv(tags);

    // Insert FR puis fallback EN (sans casser si schéma différent)
    let insertedId: string | undefined;
    let insertedTitle: string | null | undefined;
    let saveError: string | undefined;

    const fr = await insertContentFR({
      supabase,
      userId: session.user.id,
      type,
      title,
      content,
      channel,
      scheduledDate,
      tagsCsv,
      status,
    });

    if (fr.error) {
      const en = await insertContentEN({
        supabase,
        userId: session.user.id,
        type,
        title,
        content,
        channel,
        scheduledDate,
        tagsCsv,
        status,
      });

      if (en.error) {
        const e1 = (fr.error as PostgrestError)?.message ?? String(fr.error);
        const e2 = (en.error as PostgrestError)?.message ?? String(en.error);
        saveError = `Save failed (FR+EN): ${e1} / ${e2}`;
      } else {
        insertedId = en.data?.id;
        insertedTitle = (en.data?.title ?? null) as string | null;
      }
    } else {
      insertedId = fr.data?.id;
      insertedTitle = (fr.data?.titre ?? null) as string | null;
    }

    return NextResponse.json(
      {
        ok: true,
        id: insertedId,
        title: insertedTitle ?? title,
        content,
        usedUserKey,
        warning: usedUserKey ? undefined : `Fallback owner key used (${maskKey(apiKey)})`,
        saveError,
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
