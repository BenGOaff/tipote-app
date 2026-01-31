// app/api/coach/actions/reject/route.ts
// Rejet d'une suggestion (premium): on log + on alimente la mémoire longue durée.
// Objectif : le coach se souvient des idées refusées ("on avait proposé X, tu as refusé").
//
// Invariants:
// 1) Auth via cookies (getSupabaseServerClient) + user_id = auth.uid()
// 2) Respect RLS (client server Supabase), aucune mutation cross-user
// 3) Best-effort: si pas de message existant -> on insère un message assistant minimal "Noté."

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RejectBodySchema = z
  .object({
    suggestionId: z.string().trim().min(1).max(128),
    type: z.enum(["update_offer_pyramid", "update_tasks", "open_tipote_tool"]).optional(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(800).optional(),
    reason: z.string().trim().max(500).optional(),
    payload: z.record(z.unknown()).optional(),
  })
  .strict();

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function compactPayload(payload: Record<string, unknown> | undefined) {
  // On garde un payload "léger" (évite de gonfler facts)
  if (!payload || !isRecord(payload)) return null;

  const keys = Object.keys(payload).slice(0, 12);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (payload as any)[k];
    if (v === null) out[k] = null;
    else if (typeof v === "string") out[k] = v.slice(0, 240);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 6);
    else if (isRecord(v)) out[k] = Object.keys(v).slice(0, 10);
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const parsed = RejectBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    const { suggestionId, type, title, description, reason, payload } = parsed.data;

    const rejectedItem = {
      id: suggestionId,
      type: type ?? null,
      title: title ?? null,
      description: description ?? null,
      reason: reason ?? null,
      at: new Date().toISOString(),
      payload: compactPayload(payload),
    };

    // On attache le log au dernier message existant (évite de polluer la conversation)
    const { data: lastRow, error: lastErr } = await supabase
      .from("coach_messages")
      .select("id, facts, summary_tags")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      // best-effort : on renvoie ok même si log non écrit
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (!lastRow) {
      // Aucun message en base => on crée un message assistant minimal avec le log
      const { error: insErr } = await supabase.from("coach_messages").insert([
        {
          user_id: user.id,
          role: "assistant",
          content: "Noté.",
          summary_tags: ["rejected"],
          facts: { rejected_suggestions: [rejectedItem] },
        },
      ]);
      if (insErr) {
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const currentFacts = isRecord((lastRow as any).facts) ? ((lastRow as any).facts as Record<string, unknown>) : {};
    const currentTags = Array.isArray((lastRow as any).summary_tags) ? ((lastRow as any).summary_tags as string[]) : [];

    const existing = Array.isArray((currentFacts as any).rejected_suggestions)
      ? ((currentFacts as any).rejected_suggestions as any[])
      : [];

    const nextRejected = [rejectedItem, ...existing].filter(Boolean).slice(0, 50);

    const nextFacts: Record<string, unknown> = {
      ...currentFacts,
      rejected_suggestions: nextRejected,
    };

    const tagsSet = new Set<string>(currentTags.map((t) => String(t || "").trim()).filter(Boolean));
    tagsSet.add("rejected");

    const { error: updErr } = await supabase
      .from("coach_messages")
      .update({ facts: nextFacts, summary_tags: Array.from(tagsSet).slice(0, 30) })
      .eq("id", (lastRow as any).id)
      .eq("user_id", user.id);

    // Best-effort : si l'update échoue, on ne bloque pas l'UX
    if (updErr) return NextResponse.json({ ok: true }, { status: 200 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
