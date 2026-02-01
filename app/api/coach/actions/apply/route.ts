// app/api/coach/actions/apply/route.ts
// Applique une suggestion validée par l'user (coach "modifie la réalité").
//
// ✅ Double ceinture: re-validate + sanitize server-side (même si /chat a filtré)
// ✅ Ownership: user_id enforced (jamais cross-user)
// ✅ update_tasks: single + batch (payload.tasks[])
// ✅ update_offer_pyramid: business_plan.plan_json + best-effort sync offer_pyramids (delete+insert)
// ✅ Log mémoire: coach_messages.facts.applied_suggestion (continuité premium)
// ✅ Backward compatible: accepte body "legacy" ET body "suggestion"

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

// 👉 Si tu as déjà un client admin centralisé, garde-le (recommandé)
import { supabaseAdmin } from "@/lib/supabaseAdmin";
// Sinon, tu peux revenir au createClient(...) inline comme dans ton code court.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SuggestionTypeSchema = z.enum(["update_offer_pyramid", "update_tasks", "open_tipote_tool"]);
type SuggestionType = z.infer<typeof SuggestionTypeSchema>;

const NewBodySchema = z
  .object({
    suggestion: z
      .object({
        id: z.string().trim().min(1).max(128),
        type: SuggestionTypeSchema,
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(800).optional(),
        payload: z.record(z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();

const LegacyBodySchema = z
  .object({
    type: SuggestionTypeSchema,
    payload: z.record(z.unknown()).optional(),
    suggestionId: z.string().trim().min(1).max(128).optional(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(800).optional(),
  })
  .strict();

const ApplyBodySchema = z.union([NewBodySchema, LegacyBodySchema]);

type AnyRecord = Record<string, any>;
type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asRecord(v: unknown): AnyRecord | null {
  return isRecord(v) ? (v as AnyRecord) : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function uuidLike(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^[0-9a-fA-F-]{16,64}$/.test(s);
}

function isIsoYYYYMMDD(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeDueDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;

  const s = cleanString(v, 64);
  if (!s) return null;
  if (isIsoYYYYMMDD(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeStatus(v: unknown): TaskStatus | null {
  const s = cleanString(v, 32).toLowerCase();
  if (!s) return null;

  if (s === "todo") return "todo";
  if (s === "in_progress" || s === "in progress" || s === "progress") return "in_progress";
  if (s === "blocked" || s === "bloqué" || s === "bloque") return "blocked";
  if (s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine") return "done";

  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function compactPayload(payload: Record<string, unknown> | undefined) {
  if (!payload || !isRecord(payload)) return null;

  const keys = Object.keys(payload).slice(0, 20);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (payload as any)[k];
    if (v === null) out[k] = null;
    else if (typeof v === "string") out[k] = v.slice(0, 400);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 10);
    else if (isRecord(v)) out[k] = Object.keys(v).slice(0, 15);
  }
  return out;
}

async function logApplied(args: {
  userId: string;
  type: SuggestionType;
  suggestionId?: string | null;
  title?: string | null;
  description?: string | null;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
}) {
  // Best-effort: ne doit jamais casser apply
  try {
    const title = cleanString(args.title, 160);
    const base =
      args.type === "update_tasks"
        ? "✅ J’ai appliqué la mise à jour de tâche."
        : args.type === "update_offer_pyramid"
          ? "✅ J’ai appliqué la mise à jour de ta pyramide d’offre."
          : "✅ Ok, je t’ai ouvert l’outil.";

    const content = title ? `${base}\n(${title})` : base;

    const facts: Record<string, unknown> = {
      applied_suggestion: {
        id: args.suggestionId ?? null,
        type: args.type,
        title: title || null,
        description: cleanString(args.description, 400) || null,
        at: new Date().toISOString(),
        payload: compactPayload(args.payload),
        result: compactPayload(args.result),
      },
    };

    await supabaseAdmin.from("coach_messages").insert({
      user_id: args.userId,
      role: "assistant",
      content,
      summary_tags: ["applied_suggestion", args.type],
      facts,
    });
  } catch {
    // ignore
  }
}

async function applySingleTaskUpdate(args: { userId: string; taskId: string; patch: AnyRecord }) {
  const { userId, taskId, patch } = args;

  // enforce ownership + update
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("project_tasks")
    .update({ ...patch, updated_at: nowIso })
    .eq("id", taskId)
    .eq("user_id", userId)
    .select("id, title, status, due_date, priority, timeframe, updated_at")
    .maybeSingle();

  if (error) return { ok: false as const, status: 400 as const, error: error.message };
  if (!data) return { ok: false as const, status: 404 as const, error: "Task not found" };
  return { ok: true as const, task: data };
}

function buildTaskPatch(raw: AnyRecord): AnyRecord | null {
  const patch: AnyRecord = {};

  if ("title" in raw) {
    const title = cleanString(raw.title, 240);
    if (!title) return null;
    patch.title = title;
  }

  if ("due_date" in raw) patch.due_date = normalizeDueDate(raw.due_date);
  if ("timeframe" in raw) patch.timeframe = cleanString(raw.timeframe, 48) || null;
  if ("priority" in raw) patch.priority = cleanString(raw.priority, 48) || null;

  if ("status" in raw) {
    const st = normalizeStatus(raw.status);
    if (!st) return null;
    patch.status = st;
  }

  if ("done" in raw && typeof raw.done === "boolean") {
    patch.status = raw.done ? "done" : "todo";
  }

  if (Object.keys(patch).length === 0) return null;
  return patch;
}

async function syncOfferPyramidsFlagship(args: { userId: string; pyramid: AnyRecord }) {
  // Best-effort sync: replace offer_pyramids rows from selected pyramid
  const { userId, pyramid } = args;
  const now = new Date().toISOString();

  const pyramidName = cleanString(pyramid.name, 160) || "Pyramide sélectionnée";
  const pyramidSummary = cleanString(pyramid.strategy_summary, 1200);

  function mkRow(level: "lead_magnet" | "low_ticket" | "high_ticket", offer: AnyRecord): AnyRecord {
    const title = cleanString(offer.title, 160) || cleanString(offer.name, 160) || level;
    const format = cleanString(offer.format, 180);
    const composition = cleanString(offer.composition, 2000);
    const purpose = cleanString(offer.purpose, 800) || cleanString(offer.promise, 800);
    const delivery = cleanString(offer.insight, 800) || cleanString(offer.delivery, 800);

    const price = toNumber(offer.price ?? offer.price_min ?? offer.price_max ?? offer.priceMax);
    return {
      user_id: userId,
      level,
      name: cleanString(`${pyramidName} — ${title}`, 240),
      description: cleanString(`${pyramidSummary}\n\n${composition}`, 4000),
      promise: purpose,
      format,
      delivery,
      ...(price !== null ? { price_min: price, price_max: price } : {}),
      main_outcome: purpose,
      is_flagship: true,
      updated_at: now,
    };
  }

  const lead = asRecord(pyramid.lead_magnet);
  const low = asRecord(pyramid.low_ticket);
  const high = asRecord(pyramid.high_ticket);

  const rows: AnyRecord[] = [];
  if (lead) rows.push(mkRow("lead_magnet", lead));
  if (low) rows.push(mkRow("low_ticket", low));
  if (high) rows.push(mkRow("high_ticket", high));
  if (!rows.length) return;

  try {
    // table may not exist => ignore errors
    await supabaseAdmin.from("offer_pyramids").delete().eq("user_id", userId);
    await supabaseAdmin.from("offer_pyramids").insert(rows);
  } catch {
    // ignore
  }
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

    let raw: unknown = null;
    try {
      raw = await req.json();
    } catch {
      raw = null;
    }

    const parsed = ApplyBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    // Normalize to one internal shape
    const normalized = (() => {
      const d: any = parsed.data as any;
      if ("suggestion" in d) {
        return {
          type: d.suggestion.type as SuggestionType,
          payload: (d.suggestion.payload ?? {}) as Record<string, unknown>,
          suggestionId: d.suggestion.id as string,
          title: d.suggestion.title as string,
          description: (d.suggestion.description ?? "") as string,
        };
      }
      return {
        type: d.type as SuggestionType,
        payload: (d.payload ?? {}) as Record<string, unknown>,
        suggestionId: (d.suggestionId ?? null) as string | null,
        title: (d.title ?? null) as string | null,
        description: (d.description ?? null) as string | null,
      };
    })();

    const { type, payload, suggestionId, title, description } = normalized;

    // ------------------------------------------------------------
    // 1) update_tasks (single or batch)
    // ------------------------------------------------------------
    if (type === "update_tasks") {
      const p = asRecord(payload);
      if (!p) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

      // Batch mode: payload.tasks = [{ task_id/id, ...patch }]
      const tasksArr = asArray(p.tasks);
      if (tasksArr.length) {
        const updates = tasksArr.map(asRecord).filter(Boolean).slice(0, 20) as AnyRecord[];
        if (!updates.length) return NextResponse.json({ ok: false, error: "Invalid tasks batch" }, { status: 400 });

        const results: AnyRecord[] = [];
        for (const t of updates) {
          const taskIdRaw = t.task_id ?? t.id;
          const taskId = typeof taskIdRaw === "string" ? taskIdRaw.trim() : "";
          if (!taskId || !uuidLike(taskId)) {
            return NextResponse.json({ ok: false, error: "Invalid task_id in batch" }, { status: 400 });
          }

          const patch = buildTaskPatch(t);
          if (!patch) continue;

          const r = await applySingleTaskUpdate({ userId: user.id, taskId, patch });
          if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
          results.push(r.task);
        }

        await logApplied({
          userId: user.id,
          type,
          suggestionId,
          title: title ?? undefined,
          description: description ?? undefined,
          payload: payload as any,
          result: { tasks: results },
        });

        return NextResponse.json({ ok: true, type, result: { tasks: results } }, { status: 200 });
      }

      // Single mode
      const taskIdRaw = p.task_id ?? p.id;
      const taskId = typeof taskIdRaw === "string" ? taskIdRaw.trim() : "";
      if (!taskId || !uuidLike(taskId)) {
        return NextResponse.json({ ok: false, error: "Invalid task_id" }, { status: 400 });
      }

      const patch = buildTaskPatch(p);
      if (!patch) return NextResponse.json({ ok: false, error: "No valid fields to update" }, { status: 400 });

      const r = await applySingleTaskUpdate({ userId: user.id, taskId, patch });
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

      await logApplied({
        userId: user.id,
        type,
        suggestionId,
        title: title ?? undefined,
        description: description ?? undefined,
        payload: payload as any,
        result: { task: r.task },
      });

      return NextResponse.json({ ok: true, type, result: { task: r.task } }, { status: 200 });
    }

    // ------------------------------------------------------------
    // 2) update_offer_pyramid
    // ------------------------------------------------------------
    if (type === "update_offer_pyramid") {
      const p = asRecord(payload);
      if (!p) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

      const selectedIndexRaw = p.selectedIndex ?? p.selected_index;
      const pyramidRaw = p.pyramid ?? p.selected_offer_pyramid;

      const selectedIndex = toNumber(selectedIndexRaw);
      if (selectedIndex === null || !Number.isFinite(selectedIndex) || selectedIndex < 0) {
        return NextResponse.json({ ok: false, error: "Invalid selectedIndex" }, { status: 400 });
      }

      const pyramid = asRecord(pyramidRaw);
      if (!pyramid) return NextResponse.json({ ok: false, error: "Invalid pyramid" }, { status: 400 });

      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("business_plan")
        .select("plan_json")
        .eq("user_id", user.id)
        .maybeSingle();

      if (planErr) return NextResponse.json({ ok: false, error: planErr.message }, { status: 400 });
      if (!planRow) return NextResponse.json({ ok: false, error: "Business plan not found" }, { status: 404 });

      const planJson = isRecord((planRow as any).plan_json) ? ((planRow as any).plan_json as AnyRecord) : {};

      const nextPlanJson: AnyRecord = {
        ...planJson,
        selected_offer_pyramid_index: selectedIndex,
        selected_offer_pyramid: pyramid,
        // compat legacy
        selected_pyramid_index: selectedIndex,
        selected_pyramid: pyramid,
      };

      const { data, error } = await supabaseAdmin
        .from("business_plan")
        .update({ plan_json: nextPlanJson, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select("plan_json")
        .maybeSingle();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ ok: false, error: "Business plan not found" }, { status: 404 });

      // Best-effort sync offer_pyramids (si table existe)
      void syncOfferPyramidsFlagship({ userId: user.id, pyramid });

      await logApplied({
        userId: user.id,
        type,
        suggestionId,
        title: title ?? undefined,
        description: description ?? undefined,
        payload: payload as any,
        result: { selected_offer_pyramid_index: selectedIndex },
      });

      return NextResponse.json(
        { ok: true, type, result: { selected_offer_pyramid_index: selectedIndex } },
        { status: 200 },
      );
    }

    // ------------------------------------------------------------
    // 3) open_tipote_tool (no-op backend)
    // ------------------------------------------------------------
    await logApplied({
      userId: user.id,
      type,
      suggestionId,
      title: title ?? undefined,
      description: description ?? undefined,
      payload: payload as any,
      result: { noop: true },
    });

    return NextResponse.json({ ok: true, type, result: { noop: true } }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
