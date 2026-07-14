// app/api/quiz/[quizId]/route.ts
// Single quiz operations: GET detail, PATCH update, DELETE

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizeRichText } from "@/lib/richText";
import { sanitizeSlug, sanitizeShareNetworks, BRAND_FONT_CHOICES } from "@/lib/quizBranding";
import { isReservedPublicSlug } from "@/lib/publicSlug";
import { findCrossTypeSlugConflict } from "@/lib/publicSlugServer";
import {
  applyFrenchTypography,
  applyFrenchTypographyToHtml,
  isFrenchLocale,
} from "@/lib/frenchTypography";
import { computeLockedLeadIds, redactLockedLead, type LeadLike } from "@/lib/leadLock";
import { isPaidPlan } from "@/lib/planLimits";
import { fetchAllRows } from "@/lib/db/fetchAllRows";

export const dynamic = "force-dynamic";

const RICH_TEXT_FIELDS = [
  "introduction",
  "capture_heading",
  "capture_subtitle",
  "capture_submit_text",
  "survey_thanks_heading",
  "survey_thanks_body",
] as const;

// Plain-text quiz fields that benefit from French typography. Capture
// fields are stored as rich text on tipote (above), so they're handled by
// the rich-text pass below — we don't list them here.
const FR_TYPO_PLAIN_FIELDS = [
  "title",
  "cta_text",
  "consent_text",
  "share_message",
  "bonus_description",
  "bonus_intro_text",
  "start_button_text",
  "result_insight_heading",
  "result_projection_heading",
  "og_description",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ quizId: string }> };

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

    const [quizRes, questionsRes, resultsRes, leadsRows, planRes] = await Promise.all([
      supabase.from("quizzes").select("*").eq("id", quizId).eq("user_id", user.id).maybeSingle(),
      supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("sort_order"),
      supabase.from("quiz_results").select("*").eq("quiz_id", quizId).order("sort_order"),
      // Leads COMPLETS (paginés) — donut, compteurs, tendance, CSV de
      // l'onglet Résultats plus plafonnés à 1000. Borne haute navigateur ;
      // la page Analytics dédiée reste la source non bornée par quiz.
      fetchAllRows<Record<string, unknown>>(
        (from, to) =>
          supabase.from("quiz_leads").select("*, quiz_results(title)").eq("quiz_id", quizId).order("created_at", { ascending: false }).range(from, to),
        { max: 50000 },
      ),
      supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }

    const resultTitleMap = new Map<string, string>();
    for (const r of (resultsRes.data ?? [])) {
      resultTitleMap.set(r.id, r.title);
    }

    const plan = String((planRes.data as { plan?: string | null } | null)?.plan ?? "free");

    let lockedIds = new Set<string>();
    if (!isPaidPlan(plan)) {
      const { data: ownedQuizzes } = await supabase
        .from("quizzes")
        .select("id")
        .eq("user_id", user.id);
      const ownedQuizIds = (ownedQuizzes ?? []).map((q: { id: string }) => q.id);
      if (ownedQuizIds.length > 0) {
        // Timeline COMPLÈTE (paginée) pour le calcul du lock free-tier.
        const timeline = await fetchAllRows<{ id: string; created_at: string }>((from, to) =>
          supabase.from("quiz_leads").select("id, created_at").in("quiz_id", ownedQuizIds).range(from, to),
        );
        lockedIds = computeLockedLeadIds(timeline, plan);
      }
    }

    const leads = leadsRows.map((l: any) => {
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

    // Fetch the existing locale alongside ownership so the typography
    // pass below knows which language to apply rules for, even when the
    // PATCH body doesn't change the locale.
    const { data: existing } = await supabase
      .from("quizzes")
      .select("id, locale, project_id")
      .eq("id", quizId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Quiz not found" }, { status: 404 });
    }
    const existingProjectId = (existing as { project_id?: string | null }).project_id ?? null;

    const allowedFields = [
      "title", "introduction", "cta_text", "cta_url", "privacy_url",
      "consent_text", "virality_enabled", "bonus_description",
      "bonus_intro_text",
      "bonus_image_url", "bonus_image_position", "bonus_image_width", "bonus_unlocked_message", "share_message", "status", "sio_share_tag_name", "sio_capture_tag",
      "locale", "og_image_url", "og_description",
      "ask_first_name", "ask_gender",
      "capture_heading", "capture_subtitle", "capture_submit_text",
      "capture_before_questions",
      "survey_thanks_heading", "survey_thanks_body",
      "capture_first_name",
      "capture_last_name", "capture_phone", "capture_country",
      "phone_required", "first_name_required", "last_name_required", "country_required",
      "show_other_results",
      "meta_pixel_id", "ga4_measurement_id", "google_ads_conversion_id", "google_ads_conversion_label",
      "show_consent_checkbox",
      "show_results_breakdown",
      "start_button_text", "result_insight_heading", "result_projection_heading",
      "custom_footer_text", "custom_footer_url",
      "brand_font", "brand_color_primary", "brand_color_background", "brand_color_text",
      "brand_logo_url", "hide_brand_logo",
      "intro_image_url", "intro_image_position", "intro_image_width",
    ];

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in body) patch[key] = body[key];
    }

    for (const key of RICH_TEXT_FIELDS) {
      if (key in patch && typeof patch[key] === "string") {
        patch[key] = sanitizeRichText(patch[key] as string);
      }
    }

    if ("brand_font" in patch) {
      const val = patch.brand_font;
      if (val === null) {
      } else if (typeof val === "string" && BRAND_FONT_CHOICES.includes(val as typeof BRAND_FONT_CHOICES[number])) {
      } else {
        delete patch.brand_font;
      }
    }

    const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    for (const key of ["brand_color_primary", "brand_color_background", "brand_color_text"] as const) {
      if (key in patch) {
        const val = patch[key];
        if (val === null) {
        } else if (typeof val === "string" && hexRe.test(val)) {
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
        // Reserved root paths (api, embed, dashboard, robots.txt, …)
        // — on a creator's custom domain the slug sits at the URL
        // root, so anything in this list would shadow real routes
        // (or built-in browser-expected files).
        if (isReservedPublicSlug(cleaned)) {
          return NextResponse.json({ ok: false, error: "SLUG_RESERVED" }, { status: 409 });
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
        // Cross-type collision: a popquiz or hosted_page of the same
        // (user, project) owning this slug would make the custom-domain
        // catch-all ambiguous (mybrand.com/foo could be either).
        // Refuse the rename. Project-scoped: same slug across projects
        // is fine, the catch-all resolves with project_id.
        if (existingProjectId) {
          const conflictType = await findCrossTypeSlugConflict(
            user.id,
            existingProjectId,
            cleaned,
            "quiz",
          );
          if (conflictType) {
            return NextResponse.json({ ok: false, error: "SLUG_TAKEN" }, { status: 409 });
          }
        }
        patch.slug = cleaned;
      }
    }

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

    // FRENCH TYPOGRAPHY (Gwenn-style bug, mirrored from tiquiz): when the
    // quiz locale is French, swap the ASCII space for an NBSP before
    // closing punctuation (`:` `;` `!` `?` `»`) and after `«`. The
    // helper is idempotent and skips non-French locales — zero impact on
    // existing English / Spanish / etc. quizzes.
    const effectiveLocale =
      typeof patch.locale === "string"
        ? patch.locale
        : ((existing as { locale?: string | null }).locale ?? null);
    if (isFrenchLocale(effectiveLocale)) {
      for (const field of FR_TYPO_PLAIN_FIELDS) {
        if (typeof patch[field] === "string") {
          patch[field] = applyFrenchTypography(patch[field] as string, effectiveLocale);
        }
      }
      for (const field of RICH_TEXT_FIELDS) {
        if (typeof patch[field] === "string") {
          patch[field] = applyFrenchTypographyToHtml(patch[field] as string, effectiveLocale);
        }
      }
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
          question_text: applyFrenchTypography(
            String(q.question_text ?? ""),
            effectiveLocale,
          ),
          options: Array.isArray(q.options)
            ? q.options.map((o: any) => ({
                ...o,
                text:
                  typeof o?.text === "string"
                    ? applyFrenchTypography(o.text, effectiveLocale)
                    : o?.text,
              }))
            : [],
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
        insight_heading: string | null;
        projection_heading: string | null;
        cta_text: string | null;
        cta_url: string | null;
        sio_tag_name: string | null;
        sio_tag_names: string[];
        sio_course_id: string | null;
        sio_community_id: string | null;
        sort_order: number;
        image_url: string | null;
        image_position: string;
        image_width: number | null;
        min_score: number | null;
        max_score: number | null;
      }

      const toUpdate: Array<{ id: string; data: SanitizedResult }> = [];
      const toInsert: SanitizedResult[] = [];

      incoming.forEach((r: any, i: number) => {
        const sanitized: SanitizedResult = {
          quiz_id: quizId,
          title: applyFrenchTypography(
            String(r.title ?? ""),
            effectiveLocale,
          ),
          description:
            typeof r.description === "string"
              ? applyFrenchTypographyToHtml(
                  sanitizeRichText(r.description),
                  effectiveLocale,
                )
              : null,
          insight:
            typeof r.insight === "string"
              ? applyFrenchTypographyToHtml(
                  sanitizeRichText(r.insight),
                  effectiveLocale,
                )
              : null,
          projection:
            typeof r.projection === "string"
              ? applyFrenchTypographyToHtml(
                  sanitizeRichText(r.projection),
                  effectiveLocale,
                )
              : null,
          // Overrides de titres de blocs par profil (Gwenn 13 juin 2026,
          // miroir Tiquiz). Vide apres trim = NULL (titre commun).
          insight_heading:
            typeof r.insight_heading === "string" && r.insight_heading.trim()
              ? applyFrenchTypographyToHtml(sanitizeRichText(r.insight_heading), effectiveLocale)
              : null,
          projection_heading:
            typeof r.projection_heading === "string" && r.projection_heading.trim()
              ? applyFrenchTypographyToHtml(sanitizeRichText(r.projection_heading), effectiveLocale)
              : null,
          cta_text:
            r.cta_text == null
              ? null
              : applyFrenchTypography(String(r.cta_text), effectiveLocale),
          cta_url: r.cta_url == null ? null : String(r.cta_url),
          // Multi-tags SIO par profil (Gwenn 12 juillet 2026). On stocke le
          // tableau `sio_tag_names` (nettoye/dedupe) ET on remet
          // `sio_tag_name` au premier element pour la compat descendante.
          sio_tag_names: Array.isArray(r.sio_tag_names)
            ? (r.sio_tag_names as unknown[])
                .map((v) => String(v ?? "").trim())
                .filter((v, idx, arr) => v && arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === idx)
            : (r.sio_tag_name == null ? [] : [String(r.sio_tag_name).trim()].filter(Boolean)),
          sio_tag_name:
            Array.isArray(r.sio_tag_names) && r.sio_tag_names.length > 0
              ? String(r.sio_tag_names[0]).trim() || null
              : (r.sio_tag_name == null ? null : String(r.sio_tag_name)),
          sio_course_id: r.sio_course_id == null ? null : String(r.sio_course_id),
          sio_community_id:
            r.sio_community_id == null ? null : String(r.sio_community_id),
          sort_order: i,
          image_url:
            typeof r.image_url === "string" && r.image_url.trim()
              ? r.image_url.trim()
              : null,
          image_position: (() => {
            const allowed = ["top", "after_title", "after_description", "after_insight", "bottom"];
            const v = typeof r.image_position === "string" ? r.image_position : "top";
            return allowed.includes(v) ? v : "top";
          })(),
          // Largeur d'affichage de l'image de resultat (%).
          image_width: Number.isFinite(r.image_width) ? Math.trunc(r.image_width) : null,
          // Mode scoring : tranche de score (NULL en mode profil).
          min_score: Number.isFinite(r.min_score) ? Math.trunc(r.min_score) : null,
          max_score: Number.isFinite(r.max_score) ? Math.trunc(r.max_score) : null,
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

      if (toDelete.length > 0) {
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
