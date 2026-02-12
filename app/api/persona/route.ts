// app/api/persona/route.ts
// GET: read persona data from personas table
// PATCH: update persona (title, pains, desires, channels)
//   -> updates personas table + business_plan.plan_json.persona (sync)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

type AnyRecord = Record<string, unknown>;

function cleanString(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function cleanStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Persona is unique per user+role — no project_id filter needed.
    // Note: the personas table has NO 'channels' column — channels are stored
    // in persona_json (jsonb). Only select columns that actually exist.
    const { data: rows, error } = await supabaseAdmin
      .from("personas")
      .select("name, pains, desires, persona_json, updated_at")
      .eq("user_id", auth.user.id)
      .eq("role", "client_ideal")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const data = rows?.[0] ?? null;

    if (!data) {
      return NextResponse.json({ ok: true, persona: null }, { status: 200 });
    }

    // Parse JSON fields (stored as stringified JSON in some cases)
    const parseJson = (v: unknown): unknown => {
      if (typeof v === "string") {
        try { return JSON.parse(v); } catch { return v; }
      }
      return v;
    };

    // Channels live in persona_json, not as a separate column
    const pj = (data.persona_json ?? {}) as AnyRecord;
    const channelsRaw = pj.channels ?? pj.preferred_channels ?? [];

    return NextResponse.json({
      ok: true,
      persona: {
        title: data.name || "",
        pains: parseJson(data.pains) || [],
        desires: parseJson(data.desires) || [],
        channels: parseJson(channelsRaw) || [],
      },
    }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    let body: unknown = null;
    try { body = await request.json(); } catch { body = null; }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const input = body as AnyRecord;
    const title = cleanString(input.title, 240);
    const pains = cleanStringArray(input.pains);
    const desires = cleanStringArray(input.desires);
    const channels = cleanStringArray(input.channels);

    if (!title) {
      return NextResponse.json({ ok: false, error: "Titre requis" }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 1. Update personas table
    // IMPORTANT: the personas table has NO 'channels', 'triggers', or
    // 'exact_phrases' columns. Channels are stored in persona_json (jsonb).
    // Only write to columns that actually exist in the schema.

    // First, read current persona_json to merge channels into it
    const { data: currentRows } = await supabaseAdmin
      .from("personas")
      .select("persona_json")
      .eq("user_id", auth.user.id)
      .eq("role", "client_ideal")
      .limit(1);

    const currentPj = ((currentRows?.[0]?.persona_json ?? {}) as AnyRecord);

    const dataFields: AnyRecord = {
      name: title,
      pains: JSON.stringify(pains),
      desires: JSON.stringify(desires),
      persona_json: { ...currentPj, title, pains, desires, channels },
      updated_at: now,
    };

    // Tier 1: UPDATE existing persona row(s) for this user+role
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("personas")
      .update(dataFields)
      .eq("user_id", auth.user.id)
      .eq("role", "client_ideal")
      .select("name");

    if (updateError) {
      console.error("Persona update error:", updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
    }

    // Tier 2: If no row existed, INSERT (strategy_id is NOT NULL so we need it)
    if (!updatedRows || updatedRows.length === 0) {
      // Try to get a strategy_id for this user (required by schema)
      let strategyId: string | null = null;
      const { data: stratRow } = await supabaseAdmin
        .from("strategies")
        .select("id")
        .eq("user_id", auth.user.id)
        .limit(1);
      strategyId = stratRow?.[0]?.id ?? null;

      if (!strategyId) {
        // Cannot insert without strategy_id — skip personas table, plan_json update below will still work
        console.warn("No strategy_id found, skipping personas table insert");
      } else {
        const { error: insertError } = await supabaseAdmin
          .from("personas")
          .insert({
            user_id: auth.user.id,
            strategy_id: strategyId,
            ...(projectId ? { project_id: projectId } : {}),
            role: "client_ideal",
            ...dataFields,
          });

        if (insertError) {
          console.error("Persona insert error:", insertError);
          // Non-fatal: plan_json update below will still save the data
        }
      }
    }

    // 2. Update business_plan.plan_json.persona (keep strategy page in sync)
    let planQuery = supabaseAdmin
      .from("business_plan")
      .select("id, plan_json")
      .eq("user_id", auth.user.id);

    if (projectId) planQuery = planQuery.eq("project_id", projectId);

    const { data: planRow } = await planQuery.maybeSingle();

    if (planRow) {
      const planJson = (planRow.plan_json as AnyRecord) || {};
      const updatedPlanJson = {
        ...planJson,
        persona: {
          ...((planJson.persona as AnyRecord) || {}),
          title,
          name: title,
          pains,
          desires,
          channels,
        },
      };

      let updateQuery = supabaseAdmin
        .from("business_plan")
        .update({ plan_json: updatedPlanJson, updated_at: now })
        .eq("id", planRow.id)
        .eq("user_id", auth.user.id);

      if (projectId) updateQuery = updateQuery.eq("project_id", projectId);

      await updateQuery;
    }

    // 3. Update business_profiles.mission with a persona summary
    const summary = `${title}. Problèmes : ${pains.join(", ")}. Objectifs : ${desires.join(", ")}.`;
    let profileQuery = supabaseAdmin
      .from("business_profiles")
      .update({ mission: summary.slice(0, 10000), updated_at: now })
      .eq("user_id", auth.user.id);

    if (projectId) profileQuery = profileQuery.eq("project_id", projectId);

    await profileQuery;

    return NextResponse.json({
      ok: true,
      persona: { title, pains, desires, channels },
    }, { status: 200 });
  } catch (e) {
    console.error("Persona PATCH error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
