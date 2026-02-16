// app/api/automation/settings/route.ts
// GET: fetch auto-comment style preferences
// PATCH: update auto-comment style preferences
// Stored in business_profiles table

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getUserPlan, planHasAutoComments, STYLE_TONS, OBJECTIFS } from "@/lib/automationCredits";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  auto_comment_style_ton: z
    .string()
    .trim()
    .max(40)
    .optional(),
  auto_comment_langage: z
    .object({
      mots_cles: z.array(z.string().max(80)).max(20).optional(),
      emojis: z.array(z.string().max(10)).max(20).optional(),
      expressions: z.array(z.string().max(200)).max(20).optional(),
    })
    .optional(),
  auto_comment_objectifs: z
    .array(z.string().trim().max(80))
    .max(5)
    .optional(),
});

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const plan = await getUserPlan(user.id);
    const hasAccess = planHasAutoComments(plan);

    const projectId = await getActiveProjectId(supabase, user.id);

    let query = supabase
      .from("business_profiles")
      .select("auto_comment_style_ton, auto_comment_langage, auto_comment_objectifs, brand_tone_of_voice, tone_preference")
      .eq("user_id", user.id);

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      hasAccess,
      plan,
      settings: {
        auto_comment_style_ton: data?.auto_comment_style_ton ?? "professionnel",
        auto_comment_langage: data?.auto_comment_langage ?? {},
        auto_comment_objectifs: data?.auto_comment_objectifs ?? [],
        brand_tone_of_voice: data?.brand_tone_of_voice ?? null,
        tone_preference: data?.tone_preference ?? null,
      },
      available_styles: [...STYLE_TONS],
      available_objectifs: [...OBJECTIFS],
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Check plan access
    const plan = await getUserPlan(user.id);
    if (!planHasAutoComments(plan)) {
      return NextResponse.json(
        { ok: false, error: "Cette fonctionnalité nécessite un abonnement Pro ou Elite." },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    if (projectId) {
      const { error } = await supabase
        .from("business_profiles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("project_id", projectId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
    } else {
      const { error } = await supabase
        .from("business_profiles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
