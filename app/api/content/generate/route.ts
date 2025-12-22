// app/api/content/generate/route.ts
// Génération IA + sauvegarde dans content_item (sans toucher au flow auth/onboarding/magic link)
// V2 : utilise la clé OpenAI utilisateur si configurée (sinon fallback owner key)
//
// SOURCE OF TRUTH (prod) : schema FR sur public.content_item
// (titre, contenu, statut, canal, date_planifiee, tags en text)
// -> on tente d'abord l'INSERT FR (tags en CSV), sinon fallback EN si certaines envs ont un ancien schéma.

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
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the") ||
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
      .from("business_profiles")
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
    // SOURCE OF TRUTH : schema FR + tags en CSV dans une colonne text
    const tagsCsv = tags.join(",");

    // 1) Tentative FR (prod)
    const insertFRWithPrompt = await supabase
      .from("content_item")
      .insert({
        user_id: session.user.id,
        type,
        titre: null,
        statut: "draft",
        canal: channel,
        date_planifiee: scheduledDate,
        tags: tagsCsv,
        // certaines DB ont "prompt" ; si colonne absente => on retry sans
        prompt,
        contenu: content,
      } as any)
      .select("id")
      .single();

    let inserted: InsertedRow | null = insertFRWithPrompt.data ?? null;
    let insErr: PostgrestError | null = insertFRWithPrompt.error ?? null;

    // Retry FR sans prompt si colonne manquante
    if (insErr && isMissingColumnError(insErr.message)) {
      const msg = (insErr.message ?? "").toLowerCase();
      if (msg.includes("prompt")) {
        const insertFR = await supabase
          .from("content_item")
          .insert({
            user_id: session.user.id,
            type,
            titre: null,
            statut: "draft",
            canal: channel,
            date_planifiee: scheduledDate,
            tags: tagsCsv,
            contenu: content,
          } as any)
          .select("id")
          .single();

        inserted = insertFR.data ?? null;
        insErr = insertFR.error ?? null;
      }
    }

    // 2) Fallback EN si la DB n'a pas les colonnes FR
    if (insErr && isMissingColumnError(insErr.message)) {
      const insertEN = await supabase
        .from("content_item")
        .insert({
          user_id: session.user.id,
          type,
          title: null,
          status: "draft",
          channel,
          scheduled_date: scheduledDate,
          tags, // array si schema EN prévu comme array/json
          prompt,
          content,
        } as any)
        .select("id")
        .single();

      inserted = insertEN.data ?? null;
      insErr = insertEN.error ?? null;

      // Retry EN avec tags CSV si la colonne tags est text
      if (insErr && isMissingColumnError(insErr.message)) {
        const msg = (insErr.message ?? "").toLowerCase();
        if (msg.includes("tags")) {
          const insertEN2 = await supabase
            .from("content_item")
            .insert({
              user_id: session.user.id,
              type,
              title: null,
              status: "draft",
              channel,
              scheduled_date: scheduledDate,
              tags: tagsCsv,
              prompt,
              content,
            } as any)
            .select("id")
            .single();

          inserted = insertEN2.data ?? null;
          insErr = insertEN2.error ?? null;
        }
      }
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
