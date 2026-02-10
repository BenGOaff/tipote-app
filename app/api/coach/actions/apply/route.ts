// app/api/coach/actions/apply/route.ts
// Apply endpoint: exécute une suggestion validée par l'utilisateur
// ✅ Anti-régression: support ancien format + nouveau format
// ✅ Double ceinture: re-validate + sanitize server-side (même si /chat a déjà filtré)
// ✅ update_tasks: single + batch
// ✅ update_offers: business_plan.plan_json + compat legacy + sync offer_pyramids delete+insert
// ✅ Log "applied_suggestion" dans coach_messages (facts) pour mémoire long terme

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// -------------------- SCHEMAS --------------------

const SuggestionTypeSchema = z.enum(["update_offers", "update_tasks", "open_tipote_tool"]);
type SuggestionType = z.infer<typeof SuggestionTypeSchema>;

const NewApplyBodySchema = z
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

const LegacyApplyBodySchema = z
  .object({
    type: SuggestionTypeSchema,
    payload: z.record(z.unknown()).optional(),
    suggestionId: z.string().trim().min(1).max(128).optional(),
    title: z.string().trim().max(200).optional(),
    description: z.string().trim().max(800).optional(),
  })
  .strict();

type AnyRecord = Record<string, any>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asRecord(v: unknown): AnyRecord | null {
  return isRecord(v) ? (v as AnyRecord) : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cleanString(v: unknown, max = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function uuidLike(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^[0-9a-fA-F-]{16,64}$/.test(s);
}

function isIsoDateYYYYMMDD(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
function normalizeStatus(v: unknown): TaskStatus | null {
  const s = cleanString(v, 32).toLowerCase();
  if (!s) return null;
  if (s === "todo") return "todo";
  if (s === "in_progress" || s === "in progress" || s === "progress") return "in_progress";
  if (s === "blocked" || s === "bloqué" || s === "bloque") return "blocked";
  if (s === "done" || s === "completed" || s === "fait" || s === "terminé" || s === "termine") return "done";
  return null;
}

function normalizeDueDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;

  const s = cleanString(v, 64);
  if (!s) return null;

  if (isIsoDateYYYYMMDD(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const keys = Object.keys(payload).slice(0, 16);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (payload as any)[k];
    if (v === null) out[k] = null;
    else if (typeof v === "string") out[k] = v.slice(0, 400);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 10);
    else if (isRecord(v)) out[k] = Object.keys(v).slice(0, 12);
  }
  return out;
}

// -------------------- NORMALIZE INPUT (NEW OR LEGACY) --------------------

type NormalizedApply = {
  type: SuggestionType;
  payload: AnyRecord;
  suggestionId?: string;
  title?: string;
  description?: string;
};

function normalizeApplyBody(rawBody: unknown): NormalizedApply | null {
  const newParsed = NewApplyBodySchema.safeParse(rawBody);
  if (newParsed.success) {
    const s = newParsed.data.suggestion;
    return {
      type: s.type,
      payload: (asRecord(s.payload) ?? {}) as AnyRecord,
      suggestionId: s.id,
      title: s.title,
      description: s.description,
    };
  }

  const legacyParsed = LegacyApplyBodySchema.safeParse(rawBody);
  if (!legacyParsed.success) return null;

  return {
    type: legacyParsed.data.type,
    payload: (asRecord(legacyParsed.data.payload) ?? {}) as AnyRecord,
    suggestionId: legacyParsed.data.suggestionId,
    title: legacyParsed.data.title,
    description: legacyParsed.data.description,
  };
}

// -------------------- LOG MEMORY --------------------

async function logApplied(args: {
  userId: string;
  type: SuggestionType;
  suggestionId?: string;
  title?: string;
  description?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
}) {
  // Best-effort: ne jamais casser l’apply si le log échoue
  try {
    const title = cleanString(args.title, 160);
    const base =
      args.type === "update_tasks"
        ? "✅ J’ai appliqué la mise à jour de tâche."
        : args.type === "update_offers"
          ? "✅ J'ai appliqué la mise à jour de tes offres."
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

// -------------------- TASKS --------------------

async function applySingleTaskUpdate(args: { userId: string; taskId: string; patch: AnyRecord }) {
  const { userId, taskId, patch } = args;
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

function sanitizeTaskPatch(raw: AnyRecord): { taskId: string; patch: AnyRecord } | null {
  const taskId = cleanString(raw.task_id ?? raw.id, 128);
  if (!taskId || !uuidLike(taskId)) return null;

  const patch: AnyRecord = {};

  if ("title" in raw) {
    const t = cleanString(raw.title, 240);
    if (!t) return null;
    patch.title = t;
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
  return { taskId, patch };
}

// -------------------- OFFERS --------------------

async function syncOfferPyramidsFlagship(args: { userId: string; pyramid: AnyRecord }) {
  // Best-effort sync: delete + insert (comme l’ancien code)
  const { userId, pyramid } = args;
  const now = new Date().toISOString();

  const pyramidName = cleanString(pyramid.name, 160) || "Pyramide sélectionnée";
  const pyramidSummary = cleanString(pyramid.strategy_summary, 1200);

  function mkRow(level: "lead_magnet" | "low_ticket" | "high_ticket", offer: AnyRecord): AnyRecord {
    const title = cleanString(offer.title, 160) || cleanString(offer.name, 160) || level;
    const format = cleanString(offer.format, 180);
    const composition = cleanString(offer.composition, 2000);
    const purpose = cleanString(offer.purpose, 800) || cleanString(offer.promise, 800);
    const insight = cleanString(offer.insight, 800) || cleanString(offer.delivery, 800);
    const price = toNumber(offer.price ?? offer.price_min ?? offer.priceMax ?? offer.price_max);

    return {
      user_id: userId,
      level,
      name: cleanString(`${pyramidName} — ${title}`, 240),
      description: cleanString(`${pyramidSummary}\n\n${composition}`, 4000),
      promise: purpose,
      format,
      delivery: insight,
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
    await supabaseAdmin.from("offer_pyramids").delete().eq("user_id", userId);
    await supabaseAdmin.from("offer_pyramids").insert(rows);
  } catch {
    // silent best-effort
  }
}

function sanitizeOffersPayload(payload: AnyRecord) {
  const selectedIndexRaw = payload.selectedIndex ?? payload.selected_index;
  const pyramidRaw = payload.pyramid ?? payload.selected_offer_pyramid;

  const selectedIndex = toNumber(selectedIndexRaw);
  if (selectedIndex === null || !Number.isFinite(selectedIndex) || selectedIndex < 0) return null;

  const pyramid = asRecord(pyramidRaw);
  if (!pyramid) return null;

  // minimum viable : un nom
  const name = cleanString(pyramid.name ?? pyramid.title, 180);
  if (!name) return null;

  return { selectedIndex: Math.floor(selectedIndex), pyramid };
}

// -------------------- ROUTE --------------------

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

    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = null;
    }

    const normalized = normalizeApplyBody(rawBody);
    if (!normalized) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    const { type, payload, suggestionId, title, description } = normalized;

    // ---------------- update_tasks (single + batch) ----------------
    if (type === "update_tasks") {
      const p = asRecord(payload);
      if (!p) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

      // Batch mode: payload.tasks = [...]
      const tasksArr = asArray((p as AnyRecord).tasks);
      if (tasksArr.length) {
        const updates = tasksArr.map(asRecord).filter(Boolean).slice(0, 20) as AnyRecord[];
        if (!updates.length) {
          return NextResponse.json({ ok: false, error: "Invalid tasks batch" }, { status: 400 });
        }

        const results: AnyRecord[] = [];
        for (const t of updates) {
          const sanitized = sanitizeTaskPatch(t);
          if (!sanitized) {
            return NextResponse.json({ ok: false, error: "Invalid task patch in batch" }, { status: 400 });
          }

          const r = await applySingleTaskUpdate({ userId: user.id, taskId: sanitized.taskId, patch: sanitized.patch });
          if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
          results.push(r.task);
        }

        await logApplied({
          userId: user.id,
          type,
          suggestionId,
          title,
          description,
          payload: p,
          result: { tasks: results },
        });

        return NextResponse.json({ ok: true, type, result: { tasks: results } }, { status: 200 });
      }

      // Single mode
      const sanitized = sanitizeTaskPatch(p);
      if (!sanitized) {
        return NextResponse.json({ ok: false, error: "Invalid update_tasks payload" }, { status: 400 });
      }

      const r = await applySingleTaskUpdate({ userId: user.id, taskId: sanitized.taskId, patch: sanitized.patch });
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

      await logApplied({
        userId: user.id,
        type,
        suggestionId,
        title,
        description,
        payload: p,
        result: { task: r.task },
      });

      return NextResponse.json({ ok: true, type, result: { task: r.task } }, { status: 200 });
    }

    // ---------------- update_offers ----------------
    if (type === "update_offers") {
      const p = asRecord(payload);
      if (!p) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

      const clean = sanitizeOffersPayload(p);
      if (!clean) {
        return NextResponse.json({ ok: false, error: "Invalid update_offers payload" }, { status: 400 });
      }

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
        selected_offer_pyramid_index: clean.selectedIndex,
        selected_offer_pyramid: clean.pyramid,

        // compat legacy
        selected_pyramid_index: clean.selectedIndex,
        selected_pyramid: clean.pyramid,
      };

      const { data, error } = await supabaseAdmin
        .from("business_plan")
        .update({ plan_json: nextPlanJson, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select("plan_json")
        .maybeSingle();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ ok: false, error: "Business plan not found" }, { status: 404 });

      // Best-effort sync offer_pyramids (delete+insert)
      void syncOfferPyramidsFlagship({ userId: user.id, pyramid: clean.pyramid });

      await logApplied({
        userId: user.id,
        type,
        suggestionId,
        title,
        description,
        payload: p,
        result: { selected_offer_pyramid_index: clean.selectedIndex },
      });

      return NextResponse.json(
        { ok: true, type, result: { selected_offer_pyramid_index: clean.selectedIndex } },
        { status: 200 },
      );
    }

    // ---------------- open_tipote_tool ----------------
    // no-op DB, UI only (mais on log)
    const p = asRecord(payload) ?? {};
    const path = cleanString((p as any).path, 240);

    if (path && !path.startsWith("/")) {
      return NextResponse.json({ ok: false, error: "Invalid open_tipote_tool payload" }, { status: 400 });
    }

    await logApplied({
      userId: user.id,
      type,
      suggestionId,
      title,
      description,
      payload: p,
      result: path ? { path } : { noop: true },
    });

    return NextResponse.json({ ok: true, type, result: path ? { path } : { noop: true } }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
