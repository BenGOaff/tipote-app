// app/api/popquiz/[popquizId]/route.ts
// Single-popquiz operations:
//   PATCH  — update title / slug / description / is_published / cues
//   DELETE — cascade-delete the popquiz (cues go with it)
//
// RLS on `popquizzes` already gates by user_id; we still double-
// check auth here so an unauthenticated request is rejected with
// 401 instead of an opaque "Not Found".

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizeSlug } from "@/lib/quizBranding";
import { isReservedPublicSlug } from "@/lib/publicSlug";
import { findCrossTypeSlugConflict } from "@/lib/publicSlugServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ popquizId: string }> };

interface CueInput {
  quiz_id: string;
  timestamp_ms: number;
  behavior: "block" | "optional";
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { popquizId } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Ownership check up-front: RLS would also catch this on the
  // update itself, but a deliberate 404 is friendlier than the
  // "0 rows updated" silent failure RLS yields.
  const { data: existing } = await supabase
    .from("popquizzes")
    .select("id, project_id, user_id")
    .eq("id", popquizId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404 },
    );
  }
  const existingProjectId = (existing as { project_id?: string | null }).project_id ?? null;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json(
        { ok: false, error: "Title cannot be empty" },
        { status: 400 },
      );
    }
    update.title = t;
  }

  if ("description" in body) {
    update.description =
      typeof body.description === "string" ? body.description : null;
  }

  if (typeof body.is_published === "boolean") {
    update.is_published = body.is_published;
  }

  if (typeof body.locale === "string") {
    update.locale = body.locale;
  }

  if ("slug" in body) {
    if (typeof body.slug === "string" && body.slug.trim().length > 0) {
      const slug = sanitizeSlug(body.slug);
      if (!slug) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Slug invalide. Lettres minuscules, chiffres et tirets uniquement (3 à 50 caractères).",
          },
          { status: 400 },
        );
      }
      // Reserved root paths — a popquiz with slug "api" or "embed"
      // would shadow real routes on a creator's custom domain.
      if (isReservedPublicSlug(slug)) {
        return NextResponse.json(
          { ok: false, error: "SLUG_RESERVED" },
          { status: 409 },
        );
      }
      // Within-popquiz uniqueness in this project. Scoped on
      // project_id because two projects can have a popquiz with the
      // same slug (they serve via their own custom domains, no
      // ambiguity).
      if (existingProjectId) {
        const { data: ownConflict } = await supabaseAdmin
          .from("popquizzes")
          .select("id")
          .eq("user_id", user.id)
          .eq("project_id", existingProjectId)
          .ilike("slug", slug)
          .neq("id", popquizId)
          .limit(1)
          .maybeSingle();
        if (ownConflict) {
          return NextResponse.json(
            { ok: false, error: "SLUG_TAKEN" },
            { status: 409 },
          );
        }
        // Cross-type collision with a quiz or hosted_page of the
        // same (user, project). Same rationale as in /api/quiz: the
        // catch-all has to be unambiguous.
        const conflictType = await findCrossTypeSlugConflict(
          user.id,
          existingProjectId,
          slug,
          "popquiz",
        );
        if (conflictType) {
          return NextResponse.json(
            { ok: false, error: "SLUG_TAKEN" },
            { status: 409 },
          );
        }
      }
      update.slug = slug;
    } else {
      update.slug = null;
    }
  }

  // Personnalisation page publique (apparence). Tous optionnels —
  // les defaults DB produisent un rendu propre sans config.
  if ("display_title" in body) {
    // Limites larges car titre/sous-titre acceptent du HTML rich-text
    // (gras / italique / couleur / alignement). Sanitisé côté client.
    update.display_title =
      typeof body.display_title === "string" && body.display_title.trim()
        ? body.display_title.trim().slice(0, 2000)
        : null;
  }
  if ("display_subtitle" in body) {
    update.display_subtitle =
      typeof body.display_subtitle === "string" && body.display_subtitle.trim()
        ? body.display_subtitle.trim().slice(0, 4000)
        : null;
  }
  if (typeof body.bg_style === "string") {
    if (["transparent", "solid", "gradient"].includes(body.bg_style)) {
      update.bg_style = body.bg_style;
    }
  }
  if ("bg_color" in body) {
    update.bg_color =
      typeof body.bg_color === "string" && body.bg_color.trim()
        ? body.bg_color.trim().slice(0, 32)
        : null;
  }
  if ("bg_color_2" in body) {
    update.bg_color_2 =
      typeof body.bg_color_2 === "string" && body.bg_color_2.trim()
        ? body.bg_color_2.trim().slice(0, 32)
        : null;
  }
  if (typeof body.border_width === "number") {
    update.border_width = Math.max(0, Math.min(16, Math.round(body.border_width)));
  }
  if ("border_color" in body) {
    update.border_color =
      typeof body.border_color === "string" && body.border_color.trim()
        ? body.border_color.trim().slice(0, 32)
        : null;
  }
  if (typeof body.shadow_intensity === "string") {
    if (["none", "soft", "medium", "strong"].includes(body.shadow_intensity)) {
      update.shadow_intensity = body.shadow_intensity;
    }
  }
  if ("play_button_color" in body) {
    update.play_button_color =
      typeof body.play_button_color === "string" && body.play_button_color.trim()
        ? body.play_button_color.trim().slice(0, 32)
        : null;
  }
  if (typeof body.play_button_shape === "string") {
    if (["circle", "rounded", "square"].includes(body.play_button_shape)) {
      update.play_button_shape = body.play_button_shape;
    }
  }
  if (typeof body.show_creator_branding === "boolean") {
    update.show_creator_branding = body.show_creator_branding;
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("popquizzes")
      .update(update)
      .eq("id", popquizId);
    if (error) {
      const isSlugConflict =
        error.message?.includes("uniq_popquizzes_slug") ||
        error.code === "23505";
      return NextResponse.json(
        {
          ok: false,
          error: isSlugConflict
            ? "Ce slug est déjà utilisé. Choisis-en un autre."
            : error.message,
        },
        { status: 400 },
      );
    }
  }

  // Cues are PUT-style: pass an array → we wipe and replace. Skip
  // the field entirely → we leave the existing cues alone. That way
  // metadata-only updates (rename, publish toggle) don't have to
  // know anything about cues.
  if (Array.isArray(body.cues)) {
    const cues: CueInput[] = [];
    for (const c of body.cues) {
      if (!c || typeof c !== "object") continue;
      const cue = c as Record<string, unknown>;
      const quiz_id = String(cue.quiz_id ?? "");
      const timestamp_ms = Number(cue.timestamp_ms);
      if (!quiz_id || !Number.isFinite(timestamp_ms) || timestamp_ms < 0) continue;
      cues.push({
        quiz_id,
        timestamp_ms: Math.floor(timestamp_ms),
        behavior: cue.behavior === "optional" ? "optional" : "block",
      });
    }

    if (cues.length > 0) {
      const ids = Array.from(new Set(cues.map((c) => c.quiz_id)));
      const { data: ownedQuizzes } = await supabase
        .from("quizzes")
        .select("id")
        .eq("user_id", user.id)
        .in("id", ids);
      const owned = new Set((ownedQuizzes ?? []).map((q) => q.id));
      const missing = ids.filter((id) => !owned.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Quiz introuvable ou non possédé : ${missing.join(", ")}`,
          },
          { status: 400 },
        );
      }
    }

    // Replace-all: simplest semantics for the editor (no diffing).
    // The cues table is small per popquiz so the cost is negligible.
    await supabase.from("popquiz_cues").delete().eq("popquiz_id", popquizId);
    if (cues.length > 0) {
      const { error: insertError } = await supabase
        .from("popquiz_cues")
        .insert(
          cues.map((c, i) => ({
            popquiz_id: popquizId,
            quiz_id: c.quiz_id,
            timestamp_ms: c.timestamp_ms,
            behavior: c.behavior,
            display_order: i,
          })),
        );
      if (insertError) {
        return NextResponse.json(
          { ok: false, error: insertError.message },
          { status: 400 },
        );
      }
    }
  }

  // Bug Gwenn 2026-04 : « le quiz ne s'ouvre pas » quand on lance un
  // popquiz dont l'un des quiz référencés est resté en brouillon — la
  // page /q/[id] filtre status=active, donc l'iframe overlay 404.
  //
  // Garde-fou : à la publication d'un popquiz, on auto-active toutes
  // les quizzes référencés par ses cues qui sont encore en draft. Le
  // créateur n'a plus à publier chaque quiz un par un.
  if (update.is_published === true) {
    try {
      const { data: cueRows } = await supabase
        .from("popquiz_cues")
        .select("quiz_id")
        .eq("popquiz_id", popquizId);
      const cueQuizIds = Array.from(
        new Set((cueRows ?? []).map((r) => String((r as { quiz_id: string }).quiz_id))),
      ).filter(Boolean);
      if (cueQuizIds.length > 0) {
        await supabase
          .from("quizzes")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .in("id", cueQuizIds)
          .neq("status", "active");
      }
    } catch (e) {
      console.warn("[popquiz] auto-activate referenced quizzes failed (non-blocking):", e);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { popquizId } = await params;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { error } = await supabase
    .from("popquizzes")
    .delete()
    .eq("id", popquizId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
