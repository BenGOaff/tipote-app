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
      // Réglages extension (Béné 12 juin 2026, éditables depuis le popup) :
      // - reply_language_mode : "post" = répondre dans la langue du post
      //   (défaut historique), "user" = toujours dans la langue de
      //   contenu de l'user (business_profiles.content_locale).
      // - address_form : tutoiement / vouvoiement des commentaires.
      // - domain : domaine d'expertise injecté dans le prompt.
      reply_language_mode: z.enum(["post", "user"]).optional(),
      address_form: z.enum(["auto", "tu", "vous"]).optional(),
      domain: z.string().trim().max(120).optional(),
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

    // limit(1) : un user Elite multi-projets sans projet actif résolu a
    // PLUSIEURS business_profiles -> maybeSingle() sans limit jette
    // "multiple rows returned" -> 400 en boucle dans la console (retour
    // Béné 12 juin 2026).
    const { data, error } = await query.limit(1).maybeSingle();

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

    const patch: Record<string, unknown> = { ...parsed.data };
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    // MERGE de auto_comment_langage avec l'existant : deux surfaces
    // écrivent dans ce JSONB (Réglages web -> mots_cles/emojis/
    // expressions ; popup extension -> reply_language_mode/address_form/
    // domain). Un remplacement brut ferait perdre les clés de l'autre
    // surface à chaque sauvegarde (Béné 12 juin 2026).
    if (parsed.data.auto_comment_langage) {
      let q = supabase
        .from("business_profiles")
        .select("auto_comment_langage")
        .eq("user_id", user.id);
      if (projectId) q = q.eq("project_id", projectId);
      // limit(1) : même garde multi-projets que le GET ci-dessus.
      const { data: existingRow } = await q.limit(1).maybeSingle();
      const existing =
        (existingRow?.auto_comment_langage as Record<string, unknown> | null) ?? {};
      patch.auto_comment_langage = {
        ...existing,
        ...parsed.data.auto_comment_langage,
      };
    }

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
