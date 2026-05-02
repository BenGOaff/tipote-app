// app/api/quiz/[quizId]/route.ts
// Single quiz operations: GET detail, PATCH update, DELETE

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizeRichText } from "@/lib/richText";
import { sanitizeSlug, sanitizeShareNetworks, BRAND_FONT_CHOICES } from "@/lib/quizBranding";
import { computeLockedLeadIds, redactLockedLead, type LeadLike } from "@/lib/leadLock";
import { isPaidPlan } from "@/lib/planLimits";

export const dynamic = "force-dynamic";

// Fields accepting rich-text HTML (bold, italic, links, images, alignment).
// Sanitized server-side on PATCH as defence-in-depth (the editor already
// sanitizes client-side before every save).
const RICH_TEXT_FIELDS = ["introduction", "capture_heading", "capture_subtitle"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const [quizRes, questionsRes, resultsRes, leadsRes, planRes] = await Promise.all([
      supabase.from("quizzes").select("*").eq("id", quizId).eq("user_id", user.id).maybeSingle(),
      supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_results").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_leads").select("*, quiz_results(title)").eq("quiz_id", quizId).order("created_at", { ascending: false }),
      supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    // Build a lookup map for result titles (fallback if FK join fails)
    const resultTitleMap = new Map<string, string>();
    for (const r of (resultsRes.data ?? [])) {
      resultTitleMap.set(r.id, r.title);
    }

    const plan = String((planRes.data as { plan?: string | null } | null)?.plan ?? "free");

    // Free-tier lock — the rolling 30d window must be computed against ALL the
    // creator's quiz_leads (across every quiz they own), not just this quiz's
    // slice, otherwise switching between quizzes would silently change which
    // leads are visible.
    let lockedIds = new Set<string>();
    if (!isPaidPlan(plan)) {
      const { data: ownedQuizzes } = await supabase
        .from("quizzes")
        .select("id")
        .eq("user_id", user.id);
      const ownedQuizIds = (ownedQuizzes ?? []).map((q: { id: string }) => q.id);
      if (ownedQuizIds.length > 0) {
        const { data: timeline } = await supabase
          .from("quiz_leads")
          .select("id, created_at")
          .in("quiz_id", ownedQuizIds);
        lockedIds = computeLockedLeadIds(timeline ?? [], plan);
      }
    }

    const leads = (leadsRes.data ?? []).map((l: any) => {
      // Display priority: live result title (FK join) → lookup map fallback
      // → lead's own snapshot column → nothing. The snapshot is populated
      // either at capture time or by the on-delete backfill below, so a
      // deleted result never wipes a lead's recorded outcome.
      const enriched = {
        ...l,
        result_title:
          l.quiz_results?.title ??
          resultTitleMap.get(l.result_id) ??
          l.result_title ??
          null,
        quiz_results: undefined,
      };
      const locked = lockedIds.has(l.id);
      return locked
        ? redactLockedLead({ ...enriched, locked: true } as unknown as LeadLike & { locked: true })
        : { ...enriched, locked: false };
    });

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
      plan,
      locked_count: lockedIds.size,
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
      "show_consent_checkbox",
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

    if ("brand_font" in patch) {
      const val = patch.brand_font;
      if (val === null) {
        // explicit clear, allowed
      } else if (typeof val === "string" && BRAND_FONT_CHOICES.includes(val as typeof BRAND_FONT_CHOICES[number])) {
        // valid value, allowed
      } else {
        delete patch.brand_font;
      }
    }

    const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    for (const key of ["brand_color_primary", "brand_color_background"] as const) {
      if (key in patch) {
        const val = patch[key];
        if (val === null) {
          // explicit clear, allowed
        } else if (typeof val === "string" && hexRe.test(val)) {
          // valid hex, allowed
        } else {
          delete patch[key];
        }
      }
    }

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

    if ("share_networks" in body) {
      if (Array.isArray(body.share_networks)) {
        patch.share_networks = sanitizeShareNetworks(body.share_networks);
      }
    }

    if ("slug" in body) {
      const raw = body.slug;
      if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
        patch.slug = null;
      } else {
        const cleaned = sanitizeSlug(raw);
        if (!cleaned) {
          return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
        }
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

    if (Array.isArray(body.questions)) {
      const ALLOWED_TYPES = new Set([
        "multiple_choice",
        "rating_scale",
        "star_rating",
        "free_text",
        "image_choice",
        "yes_no",
      ]);
      const incoming = body.questions as any[];

      const { data: snapshot, error: snapshotErr } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId);
      if (snapshotErr) {
        return NextResponse.json(
          { ok: false, error: "SNAPSHOT_FAILED", message: snapshotErr.message },
          { status: 500 },
        );
      }
      const snapshotRows: any[] = snapshot ?? [];

      if (incoming.length === 0 && snapshotRows.length > 0) {
        console.error(`[quiz PATCH] REFUSED empty-array wipe of ${snapshotRows.length} questions for quiz ${quizId}`);
        return NextResponse.json(
          {
            ok: false,
            error: "EMPTY_QUESTIONS_WIPE_REFUSED",
            message: "Refus de remplacer toutes tes questions par une liste vide. Recharge la page pour récupérer ta dernière version.",
          },
          { status: 400 },
        );
      }

      const sanitized = incoming.map((q: any, i: number) => {
        const rawType = typeof q.question_type === "string" ? q.question_type : "multiple_choice";
        const question_type = ALLOWED_TYPES.has(rawType) ? rawType : "multiple_choice";
        return {
          quiz_id: quizId,
          question_text: String(q.question_text ?? ""),
          options: Array.isArray(q.options) ? q.options : [],
          sort_order: i,
          question_type,
          config: q.config && typeof q.config === "object" && !Array.isArray(q.config) ? q.config : {},
        };
      });

      const { error: deleteErr } = await supabase
        .from("quiz_questions")
        .delete()
        .eq("quiz_id", quizId);
      if (deleteErr) {
        return NextResponse.json(
          { ok: false, error: "DELETE_FAILED", message: deleteErr.message },
          { status: 500 },
        );
      }

      if (sanitized.length > 0) {
        const { error: insertErr } = await supabase.from("quiz_questions").insert(sanitized);
        if (insertErr) {
          console.error(`[quiz PATCH] Insert failed for quiz ${quizId}, attempting snapshot restore:`, insertErr.message);
          if (snapshotRows.length > 0) {
            const restorePayload = snapshotRows.map((r: any) => {
              const { created_at: _ca, updated_at: _ua, ...rest } = r;
              void _ca; void _ua;
              return rest;
            });
            const { error: restoreErr } = await supabase.from("quiz_questions").insert(restorePayload);
            if (restoreErr) {
              console.error(`[quiz PATCH] CATASTROPHIC: snapshot restore also failed for quiz ${quizId}:`, restoreErr.message);
              return NextResponse.json(
                {
                  ok: false,
                  error: "INSERT_AND_RESTORE_FAILED",
                  message: "Sauvegarde échouée et restauration aussi. Ton éditeur a la version actuelle — ne quitte pas la page et réessaie.",
                  insert_error: insertErr.message,
                  restore_error: restoreErr.message,
                },
                { status: 500 },
              );
            }
          }
          return NextResponse.json(
            { ok: false, error: "INSERT_FAILED_RESTORED", message: `Sauvegarde échouée (${insertErr.message}), ta version précédente a été restaurée.` },
            { status: 500 },
          );
        }
      }
    }

    // Update results if provided.
    //
    // LEAD-SAFETY GUARANTEE (mirrored from tiquiz, 2026-05-02):
    // We never lose a lead. Three independent defences cover the
    // result-deletion path so a single failure can't compromise the
    // dataset:
    //
    //   1. Migration 20260502 sets the FK to ON DELETE SET NULL, so
    //      even a raw DELETE FROM quiz_results never blocks on leads
    //      and never deletes them.
    //   2. Before any deletion we BACKFILL leads.result_title from
    //      the result we're about to remove, so even legacy leads
    //      with a NULL snapshot keep their displayed result name.
    //   3. App code does an in-place UPDATE for kept rows (preserves
    //      FK linkage entirely), explicit NULL-out for removed rows
    //      (belt-and-suspenders if the migration is applied late),
    //      then DELETE.
    //   4. The lead row itself is NEVER touched — only result_id
    //      can transition to NULL. Every other column on quiz_leads
    //      stays bit-identical (email, first_name, last_name, phone,
    //      country, answers, consent_given…).
    if (Array.isArray(body.results)) {
      const incoming = body.results as any[];

      const { data: snapshot, error: snapshotErr } = await supabase
        .from("quiz_results")
        .select("*")
        .eq("quiz_id", quizId);
      if (snapshotErr) {
        return NextResponse.json(
          { ok: false, error: "SNAPSHOT_FAILED", message: snapshotErr.message },
          { status: 500 },
        );
      }
      const snapshotRows = (snapshot ?? []) as Array<{ id: string; title: string }>;

      if (incoming.length === 0 && snapshotRows.length > 0) {
        console.error(`[quiz PATCH] REFUSED empty-array wipe of ${snapshotRows.length} results for quiz ${quizId}`);
        return NextResponse.json(
          {
            ok: false,
            error: "EMPTY_RESULTS_WIPE_REFUSED",
            message: "Refus de remplacer tous tes résultats par une liste vide. Recharge la page pour récupérer ta dernière version.",
          },
          { status: 400 },
        );
      }

      const existingIds = new Set(snapshotRows.map((r) => r.id));

      interface SanitizedResult {
        quiz_id: string;
        title: string;
        description: string | null;
        insight: string | null;
        projection: string | null;
        cta_text: string | null;
        cta_url: string | null;
        sio_tag_name: string | null;
        sio_course_id: string | null;
        sio_community_id: string | null;
        sort_order: number;
      }

      const toUpdate: Array<{ id: string; data: SanitizedResult }> = [];
      const toInsert: SanitizedResult[] = [];

      incoming.forEach((r: any, i: number) => {
        const sanitized: SanitizedResult = {
          quiz_id: quizId,
          title: String(r.title ?? ""),
          description:
            typeof r.description === "string" ? sanitizeRichText(r.description) : null,
          insight:
            typeof r.insight === "string" ? sanitizeRichText(r.insight) : null,
          projection:
            typeof r.projection === "string" ? sanitizeRichText(r.projection) : null,
          cta_text: r.cta_text == null ? null : String(r.cta_text),
          cta_url: r.cta_url == null ? null : String(r.cta_url),
          sio_tag_name: r.sio_tag_name == null ? null : String(r.sio_tag_name),
          sio_course_id: r.sio_course_id == null ? null : String(r.sio_course_id),
          sio_community_id:
            r.sio_community_id == null ? null : String(r.sio_community_id),
          sort_order: i,
        };

        const incomingId =
          typeof r.id === "string" && UUID_RE.test(r.id) ? r.id : null;
        if (incomingId && existingIds.has(incomingId)) {
          toUpdate.push({ id: incomingId, data: sanitized });
        } else {
          toInsert.push(sanitized);
        }
      });

      const incomingIdSet = new Set(toUpdate.map((u) => u.id));
      const toDelete = snapshotRows.filter((r) => !incomingIdSet.has(r.id));

      // 1) Update existing rows in place — preserves leads.result_id.
      for (const upd of toUpdate) {
        const { error: upErr } = await supabase
          .from("quiz_results")
          .update(upd.data)
          .eq("id", upd.id);
        if (upErr) {
          return NextResponse.json(
            { ok: false, error: "UPDATE_FAILED", message: upErr.message },
            { status: 500 },
          );
        }
      }

      // 2) Insert truly-new rows.
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from("quiz_results")
          .insert(toInsert);
        if (insErr) {
          return NextResponse.json(
            { ok: false, error: "INSERT_FAILED", message: insErr.message },
            { status: 500 },
          );
        }
      }

      // 3) Drop the rows the user removed. Three layers of lead
      //    safety — see comment block above.
      if (toDelete.length > 0) {
        // (a) Backfill the result_title snapshot. Update only leads
        // whose snapshot is still NULL; we never overwrite a lead
        // that already carries a title (could be from a previous
        // result rename, or from the lead-capture endpoint that
        // captured the live title at submission time).
        for (const r of toDelete) {
          const { error: titleErr } = await supabase
            .from("quiz_leads")
            .update({ result_title: r.title })
            .eq("result_id", r.id)
            .is("result_title", null);
          if (titleErr) {
            console.error(
              `[quiz PATCH] result_title backfill failed for result ${r.id} on quiz ${quizId}:`,
              titleErr.message,
            );
            return NextResponse.json(
              {
                ok: false,
                error: "LEAD_BACKFILL_FAILED",
                message: titleErr.message,
              },
              { status: 500 },
            );
          }
        }

        // (b) Explicit NULL-out, in case the FK still has the legacy
        // NO ACTION clause on this environment.
        const deletedIds = toDelete.map((r) => r.id);
        const { error: nullErr } = await supabase
          .from("quiz_leads")
          .update({ result_id: null })
          .in("result_id", deletedIds);
        if (nullErr) {
          return NextResponse.json(
            { ok: false, error: "LEADS_NULL_FAILED", message: nullErr.message },
            { status: 500 },
          );
        }

        // (c) Migration 20260502 backs both with ON DELETE SET NULL
        // at the FK level, so even a future code path that bypasses
        // these guards can never lose a lead row.
        const { error: delErr } = await supabase
          .from("quiz_results")
          .delete()
          .in("id", deletedIds);
        if (delErr) {
          return NextResponse.json(
            { ok: false, error: "DELETE_FAILED", message: delErr.message },
            { status: 500 },
          );
        }
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
