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

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    let query = supabaseAdmin
      .from("personas")
      .select("name, pains, desires, channels, persona_json, updated_at")
      .eq("user_id", auth.user.id)
      .eq("role", "client_ideal");

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

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

    return NextResponse.json({
      ok: true,
      persona: {
        title: data.name || "",
        pains: parseJson(data.pains) || [],
        desires: parseJson(data.desires) || [],
        channels: parseJson(data.channels) || [],
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
    const personaPayload: AnyRecord = {
      user_id: auth.user.id,
      ...(projectId ? { project_id: projectId } : {}),
      role: "client_ideal",
      name: title,
      pains: JSON.stringify(pains),
      desires: JSON.stringify(desires),
      channels: JSON.stringify(channels),
      updated_at: now,
    };

    const { error: personaError } = await supabaseAdmin
      .from("personas")
      .upsert(personaPayload, { onConflict: "user_id,role" });

    if (personaError) {
      console.error("Persona upsert error:", personaError);
      return NextResponse.json({ ok: false, error: personaError.message }, { status: 400 });
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
