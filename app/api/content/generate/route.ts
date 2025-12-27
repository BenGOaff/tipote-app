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
  provider?: Provider;
  channel?: string;
  scheduledDate?: string | null;
  tags?: string[];
  prompt?: string;

  // compat legacy
  brief?: string;
  consigne?: string;
  angle?: string;
  text?: string;
};

function safeString(x: unknown): string {
  if (typeof x === "string") return x;
  return "";
}

function normalizeProvider(x: unknown): Provider {
  const s = safeString(x).trim().toLowerCase();
  if (s === "claude") return "claude";
  if (s === "gemini") return "gemini";
  return "openai";
}

function isoDateOrNull(x: unknown): string | null {
  const s = safeString(x).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function joinTagsCsv(tags: string[]): string {
  return (tags ?? [])
    .map((t) => String(t ?? "").trim())
    .filter(Boolean)
    .slice(0, 50)
    .join(",");
}

function maskKey(key: string | null): string {
  const s = (key ?? "").trim();
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
}

// Insert EN (schéma older)
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
      type: row.type,
      titre: row.title,
      contenu: row.content,
      statut: row.status,
      canal: row.channel,
      date_planifiee: row.scheduledDate,
      tags: row.tagsCsv,
    } as any)
    .select("id, titre")
    .single();

  return { data, error };
}

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the '") ||
    (m.includes("column") && m.includes("exist")) ||
    m.includes("schema cache") ||
    m.includes("pgrst")
  );
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

    // Billing gating minimal (A5) : abonnement requis pour générer du contenu
    // On lit le plan depuis la table `profiles` (rempli par webhook Systeme.io).
    // Si la table/colonne n’existe pas ou RLS bloque, on n’empêche pas (fail-open) pour ne pas casser en prod.
    try {
      const { data: billingProfile, error: billingError } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!billingError) {
        const plan = (billingProfile as any)?.plan as string | null | undefined;
        const p = (plan ?? "").toLowerCase().trim();
        const hasPlan = p === "basic" || p === "essential" || p === "elite";
        if (!hasPlan) {
          return NextResponse.json(
            { ok: false, code: "subscription_required", error: "Abonnement requis pour générer du contenu." },
            { status: 402 },
          );
        }
      }
    } catch {
      // fail-open
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

    const apiKey = (userKey ?? ownerKey).trim();

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Aucune clé OpenAI configurée (user ou owner)." },
        { status: 400 },
      );
    }

    const client = new OpenAI({ apiKey });

    const typeLabel = type;
    const tagsCsv = joinTagsCsv(tags);

    const systemPrompt = [
      "Tu es Tipote, un assistant business & contenu.",
      "Tu écris en français, avec un style clair, pro, actionnable.",
      "Tu ne mentionnes pas que tu es une IA.",
      "Tu rends un contenu final prêt à publier.",
    ].join("\n");

    const userContextLines: string[] = [];
    userContextLines.push(`Type: ${typeLabel}`);
    if (channel) userContextLines.push(`Canal: ${channel}`);
    if (scheduledDate) userContextLines.push(`Date planifiée : ${scheduledDate}`);
    if (tagsCsv) userContextLines.push(`Tags: ${tagsCsv}`);

    userContextLines.push("");
    userContextLines.push("Business profile (si disponible) :");
    userContextLines.push(profile ? JSON.stringify(profile) : "Aucun profil.");
    userContextLines.push("");
    userContextLines.push("Business plan (si disponible) :");
    userContextLines.push(planJson ? JSON.stringify(planJson) : "Aucun plan.");
    userContextLines.push("");
    userContextLines.push("Brief :");
    userContextLines.push(prompt);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContextLines.join("\n") },
      ],
    });

    const content = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return NextResponse.json({ ok: false, error: "Empty content from model" }, { status: 502 });
    }

    const title = (() => {
      const firstLine = content.split("\n").find((l) => l.trim()) ?? null;
      if (!firstLine) return null;
      const t = firstLine.replace(/^#+\s*/, "").trim();
      if (!t) return null;
      return t.slice(0, 120);
    })();

    // Status par défaut : draft
    const status = "draft";

    // Insert : essayer EN puis fallback FR si colonnes manquantes
    const tryEN = await insertContentEN({
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

    if (!tryEN.error) {
      return NextResponse.json(
        {
          ok: true,
          id: tryEN.data?.id,
          title: tryEN.data?.title ?? title,
          content,
          usedUserKey: Boolean(userKey),
          maskedKey: maskKey(apiKey),
        },
        { status: 200 },
      );
    }

    const enErr = tryEN.error as PostgrestError | null;
    if (!isMissingColumnError(enErr?.message)) {
      return NextResponse.json(
        { ok: false, error: enErr?.message ?? "Insert error" },
        { status: 400 },
      );
    }

    const tryFR = await insertContentFR({
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

    if (tryFR.error) {
      return NextResponse.json(
        { ok: false, error: (tryFR.error as any)?.message ?? "Insert error" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        id: tryFR.data?.id,
        title: (tryFR.data as any)?.titre ?? title,
        content,
        usedUserKey: Boolean(userKey),
        maskedKey: maskKey(apiKey),
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
