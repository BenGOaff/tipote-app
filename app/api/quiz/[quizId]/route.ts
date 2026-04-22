// app/api/quiz/[quizId]/route.ts
// Single quiz operations: GET detail, PATCH update, DELETE

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizeRichText } from "@/lib/richText";
import { sanitizeSlug, sanitizeShareNetworks, BRAND_FONT_CHOICES } from "@/lib/quizBranding";

export const dynamic = "force-dynamic";

// Fields accepting rich-text HTML (bold, italic, links, images, alignment).
// Sanitized server-side on PATCH as defence-in-depth (the editor already
// sanitizes client-side before every save).
const RICH_TEXT_FIELDS = ["introduction"] as const;

type RouteContext = { params: Promise<{ quizId: string }> };

// GET — quiz with questions, results, and leads count
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const [quizRes, questionsRes, resultsRes, leadsRes] = await Promise.all([
      supabase.from("quizzes").select("*").eq("id", quizId).eq("user_id", user.id).maybeSingle(),
      supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_results").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_leads").select("*, quiz_results(title)").eq("quiz_id", quizId).order("created_at", { ascending: false }),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    // Build a lookup map for result titles (fallback if FK join fails)
    const resultTitleMap = new Map<string, string>();
    for (const r of (resultsRes.data ?? [])) {
      resultTitleMap.set(r.id, r.title);
    }

    const leads = (leadsRes.data ?? []).map((l: any) => ({
      ...l,
      result_title: l.quiz_results?.title ?? resultTitleMap.get(l.result_id) ?? null,
      quiz_results: undefined,
    }));

    return NextResponse.json({
      ok: true,
      quiz: {
        ...quizRes.data,
        questions: (questionsRes.data ?? []).map((q: any) => ({
          ...q,
          options: q.options as { text: string; result_index: number }[],
        })),
        results: resultsRes.data ?? [],
      },
      leads,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PATCH — update quiz fields and/or status
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("quizzes")
      .select("id")
      .eq("id", quizId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    // Build patch
    const allowedFields = [
      "title", "introduction", "cta_text", "cta_url", "privacy_url",
      "consent_text", "virality_enabled", "bonus_description",
      "bonus_image_url", "share_message", "status", "sio_share_tag_name",
      "locale", "og_image_url", "og_description",
      "ask_first_name", "ask_gender",
      "capture_heading", "capture_subtitle", "capture_first_name",
      "capture_last_name", "capture_phone", "capture_country",
      "start_button_text", "result_insight_heading", "result_projection_heading",
      "custom_footer_text", "custom_footer_url",
      "brand_font", "brand_color_primary", "brand_color_background",
    ];

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in body) patch[key] = body[key];
    }

    // Sanitize rich-text fields server-side (browser already sanitizes).
    for (const key of RICH_TEXT_FIELDS) {
      if (key in patch && typeof patch[key] === "string") {
        patch[key] = sanitizeRichText(patch[key] as string);
      }
    }

    // Validate brand_font against whitelist (null = clear).
    if ("brand_font" in patch) {
      const val = patch.brand_font;
      if (val !== null && (typeof val !== "string" || !BRAND_FONT_CHOICES.includes(val as typeof BRAND_FONT_CHOICES[number]))) {
        patch.brand_font = null;
      }
    }

    // Validate hex colors (null = clear, otherwise must be #rgb or #rrggbb).
    const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    for (const key of ["brand_color_primary", "brand_color_background"] as const) {
      if (key in patch) {
        const val = patch[key];
        if (val !== null && (typeof val !== "string" || !hexRe.test(val))) patch[key] = null;
      }
    }

    // Custom footer is a paid-plan feature. Force null on free plans so that
    // the public renderer falls back to the Tipote branding footer.
    if ("custom_footer_text" in patch || "custom_footer_url" in patch) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .maybeSingle();
      const plan = String((prof as { plan?: string | null } | null)?.plan ?? "free").toLowerCase();
      const isPaidPlan = plan !== "free";
      if (!isPaidPlan) {
        patch.custom_footer_text = null;
        patch.custom_footer_url = null;
      }
    }

    // Share networks: enum-filter + dedupe.
    if ("share_networks" in body) {
      patch.share_networks = sanitizeShareNetworks(body.share_networks);
    }

    // Slug: sanitize + verify uniqueness (case-insensitive) against other quizzes.
    if ("slug" in body) {
      const raw = body.slug;
      if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
        patch.slug = null;
      } else {
        const cleaned = sanitizeSlug(raw);
        if (!cleaned) {
          return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
        }
        // Block slugs that look like a UUID prefix (would shadow /q/{uuid}).
        if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(cleaned)) {
          return NextResponse.json({ ok: false, error: "Slug cannot look like an ID" }, { status: 400 });
        }
        const { data: conflict } = await supabase
          .from("quizzes")
          .select("id")
          .ilike("slug", cleaned)
          .neq("id", quizId)
          .limit(1)
          .maybeSingle();
        if (conflict) {
          return NextResponse.json({ ok: false, error: "SLUG_TAKEN" }, { status: 409 });
        }
        patch.slug = cleaned;
      }
    }

    // Widget overrides: must be null OR a UUID belonging to the current user.
    // Invalid/non-owned IDs silently become null (defensive — never leak a
    // foreign widget onto someone else's quiz).
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const currentUserId = user.id;
    async function resolveWidgetOverride(
      table: "toast_widgets" | "social_share_widgets",
      raw: unknown,
    ): Promise<string | null> {
      if (raw === null || raw === "" || raw === undefined) return null;
      if (typeof raw !== "string" || !uuidRe.test(raw)) return null;
      const { data } = await supabase
        .from(table)
        .select("id")
        .eq("id", raw)
        .eq("user_id", currentUserId)
        .maybeSingle();
      return data?.id ?? null;
    }
    if ("toast_widget_id" in body) {
      patch.toast_widget_id = await resolveWidgetOverride("toast_widgets", body.toast_widget_id);
    }
    if ("share_widget_id" in body) {
      patch.share_widget_id = await resolveWidgetOverride("social_share_widgets", body.share_widget_id);
    }

    const { error } = await supabase.from("quizzes").update(patch).eq("id", quizId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Update questions if provided
    if (Array.isArray(body.questions)) {
      // Delete old questions and re-insert
      await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);
      if (body.questions.length > 0) {
        await supabase.from("quiz_questions").insert(
          body.questions.map((q: any, i: number) => ({
            quiz_id: quizId,
            question_text: String(q.question_text ?? ""),
            options: Array.isArray(q.options) ? q.options : [],
            sort_order: i,
          })),
        );
      }
    }

    // Update results if provided
    if (Array.isArray(body.results)) {
      await supabase.from("quiz_results").delete().eq("quiz_id", quizId);
      if (body.results.length > 0) {
        await supabase.from("quiz_results").insert(
          body.results.map((r: any, i: number) => ({
            quiz_id: quizId,
            title: String(r.title ?? ""),
            description: typeof r.description === "string" ? sanitizeRichText(r.description) : null,
            insight: typeof r.insight === "string" ? sanitizeRichText(r.insight) : null,
            projection: typeof r.projection === "string" ? sanitizeRichText(r.projection) : null,
            cta_text: r.cta_text ?? null,
            cta_url: r.cta_url ?? null,
            sio_tag_name: r.sio_tag_name ?? null,
            sio_course_id: r.sio_course_id ?? null,
            sio_community_id: r.sio_community_id ?? null,
            sort_order: i,
          })),
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/quiz/[quizId]] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// DELETE — delete quiz (cascades to questions, results, leads)
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("quizzes")
      .delete()
      .eq("id", quizId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
