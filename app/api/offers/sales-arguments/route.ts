// POST /api/offers/sales-arguments
//   body: { offerIndex: number }
//   → generate (or regenerate) the 10 selling-points for the offer at
//     business_profiles.offers[offerIndex] using Claude, then persist
//     them inside the same JSONB. Returns the bullets so the UI can
//     show them immediately.
//
// PATCH /api/offers/sales-arguments
//   body: { offerIndex: number, bullets: SalesArgumentBullet[] }
//   → save user-edited bullets. The persona/offer signatures are
//     refreshed so the auto-invalidation doesn't immediately wipe what
//     the user just typed.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { consumeCredits, ensureUserCredits } from "@/lib/credits";
import { callClaude, getClaudeApiKey, resolveClaudeModel } from "@/lib/claude";
import {
  buildSalesArgumentsPrompt,
  offerSignature,
  parseSalesArgumentsResponse,
  personaSignature,
  type SalesArgumentBullet,
  type SalesArguments,
} from "@/lib/salesArguments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadContext(supabase: any, userId: string, projectId: string | null) {
  let profile: any = null;
  try {
    const q = supabase.from("business_profiles").select("*").eq("user_id", userId);
    if (projectId) q.eq("project_id", projectId);
    const { data } = await q.maybeSingle();
    profile = data;
  } catch {
    /* non-blocking */
  }

  let persona: any = null;
  try {
    const q = supabase
      .from("personas")
      .select(
        "persona_json,name,description,pains,desires,objections,current_situation,desired_situation,awareness_level",
      )
      .eq("user_id", userId)
      .eq("role", "client_ideal");
    if (projectId) q.eq("project_id", projectId);
    const { data } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      const pj =
        typeof (data as any).persona_json === "object" && (data as any).persona_json
          ? (data as any).persona_json
          : null;
      persona =
        pj ?? {
          name: (data as any).name ?? null,
          current_situation: (data as any).current_situation ?? null,
          desired_situation: (data as any).desired_situation ?? null,
          pains: (data as any).pains ?? null,
          desires: (data as any).desires ?? null,
          objections: (data as any).objections ?? null,
          awareness_level: (data as any).awareness_level ?? null,
          description: (data as any).description ?? null,
        };
    }
  } catch {
    /* non-blocking */
  }

  return { profile, persona };
}

async function persistArguments(
  supabase: any,
  userId: string,
  projectId: string | null,
  offerIndex: number,
  args: SalesArguments,
): Promise<{ ok: boolean; offers?: any[]; error?: string }> {
  const q = supabase.from("business_profiles").select("offers").eq("user_id", userId);
  if (projectId) q.eq("project_id", projectId);
  const { data: row, error: readErr } = await q.maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  const offers = Array.isArray(row?.offers) ? [...(row!.offers as any[])] : [];
  if (offerIndex < 0 || offerIndex >= offers.length) {
    return { ok: false, error: "offerIndex out of range" };
  }
  offers[offerIndex] = { ...offers[offerIndex], sales_arguments: args };

  const upd = supabase
    .from("business_profiles")
    .update({ offers })
    .eq("user_id", userId);
  if (projectId) upd.eq("project_id", projectId);
  const { error: updErr } = await upd;
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, offers };
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;
  const projectId = await getActiveProjectId(supabase, userId);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const offerIndex = Number(body.offerIndex);
  if (!Number.isInteger(offerIndex) || offerIndex < 0) {
    return NextResponse.json(
      { ok: false, error: "offerIndex required" },
      { status: 400 },
    );
  }

  const credits = await ensureUserCredits(userId);
  if (credits.total_remaining < 1) {
    return NextResponse.json(
      { ok: false, error: "Plus de crédits disponibles", code: "NO_CREDITS" },
      { status: 402 },
    );
  }

  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Clé Claude owner manquante (env CLAUDE_API_KEY_OWNER)." },
      { status: 503 },
    );
  }

  const { profile, persona } = await loadContext(supabase, userId, projectId);
  const offers = Array.isArray(profile?.offers) ? profile.offers : [];
  const offer = offers[offerIndex];
  if (!offer) {
    return NextResponse.json(
      { ok: false, error: "Offer not found" },
      { status: 404 },
    );
  }

  const { system, user: userPrompt } = buildSalesArgumentsPrompt({
    offer,
    persona,
    storytelling: typeof profile?.storytelling === "string" ? profile.storytelling : undefined,
    niche: typeof profile?.niche === "string" ? profile.niche : undefined,
    mission: typeof profile?.mission === "string" ? profile.mission : undefined,
  });

  let raw: string;
  try {
    raw = await callClaude({
      apiKey,
      system,
      user: userPrompt,
      maxTokens: 2500,
      temperature: 0.6,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `Erreur IA: ${e?.message || "Service indisponible"}` },
      { status: 502 },
    );
  }

  let bullets: SalesArgumentBullet[];
  try {
    bullets = parseSalesArgumentsResponse(raw);
  } catch (e: any) {
    console.error("Sales arguments parse error. Raw:", raw.slice(0, 500));
    return NextResponse.json(
      { ok: false, error: e?.message || "Réponse IA invalide" },
      { status: 500 },
    );
  }

  const args: SalesArguments = {
    generated_at: new Date().toISOString(),
    persona_signature: personaSignature(persona),
    offer_signature: offerSignature(offer),
    // Métadonnée DB : on enregistre le modèle réellement utilisé pour la
    // génération (résolu via la lib centrale → Sonnet 4.6 par défaut).
    model: resolveClaudeModel(),
    bullets,
  };

  const saved = await persistArguments(supabase, userId, projectId, offerIndex, args);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  // 1 credit per generation. We charge AFTER successful persist so a
  // failed write doesn't burn credits. PATCH (manual edits) stays free.
  let creditsLeft: number | null = null;
  try {
    const snap = await consumeCredits(userId, 1, {
      feature: "offer_sales_arguments_generate",
      offer_name: typeof offer?.name === "string" ? offer.name : null,
    });
    creditsLeft = snap?.total_remaining ?? null;
  } catch (e) {
    console.error("[sales-arguments] consumeCredits failed:", e);
  }

  return NextResponse.json({ ok: true, salesArguments: args, creditsLeft });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;
  const projectId = await getActiveProjectId(supabase, userId);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const offerIndex = Number(body.offerIndex);
  if (!Number.isInteger(offerIndex) || offerIndex < 0) {
    return NextResponse.json(
      { ok: false, error: "offerIndex required" },
      { status: 400 },
    );
  }
  const rawBullets = Array.isArray(body.bullets) ? body.bullets : null;
  if (!rawBullets) {
    return NextResponse.json(
      { ok: false, error: "bullets array required" },
      { status: 400 },
    );
  }

  const bullets: SalesArgumentBullet[] = [];
  for (const b of rawBullets) {
    if (!b || typeof b !== "object") continue;
    const benefit = String((b as any).benefit ?? "").trim();
    const consequence = String((b as any).consequence ?? "").trim();
    if (!benefit || !consequence) continue;
    bullets.push({
      benefit,
      consequence,
      angle: String((b as any).angle ?? "story").trim() || "story",
      hook_idea: String((b as any).hook_idea ?? "").trim(),
    });
  }
  if (bullets.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Aucune puce valide" },
      { status: 400 },
    );
  }

  const { profile, persona } = await loadContext(supabase, userId, projectId);
  const offers = Array.isArray(profile?.offers) ? profile.offers : [];
  const offer = offers[offerIndex];
  if (!offer) {
    return NextResponse.json(
      { ok: false, error: "Offer not found" },
      { status: 404 },
    );
  }

  const args: SalesArguments = {
    generated_at:
      offer?.sales_arguments?.generated_at ?? new Date().toISOString(),
    persona_signature: personaSignature(persona),
    offer_signature: offerSignature(offer),
    // Garde la valeur stockée si elle existe (audit trail des anciennes
    // générations) ; sinon = modèle courant.
    model: offer?.sales_arguments?.model ?? resolveClaudeModel(),
    bullets,
  };

  const saved = await persistArguments(supabase, userId, projectId, offerIndex, args);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, salesArguments: args });
}
