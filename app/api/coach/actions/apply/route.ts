// app/api/coach/actions/apply/route.ts
// Applique une suggestion du Coach IA en DB (premium: "modifie la réalité").
//
// Invariants (anti-régression):
// 1) Auth via cookies (getSupabaseServerClient) + user_id source-of-truth = auth.uid()
// 2) Mutations via supabaseAdmin + filtre user_id (jamais d'update cross-user)
// 3) Payload invalide => 400 (safe), row not found => 404
//
// Types supportés (MVP+):
// - update_tasks: patch 1 task OU batch (payload.tasks[])
// - update_offer_pyramid: met à jour business_plan.plan_json.selected_offer_pyramid_index + selected_offer_pyramid
//    + best-effort sync offer_pyramids (delete+insert 3 rows) pour refléter rename/précision/restructure
// - open_tipote_tool: no-op (UI only)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SuggestionTypeSchema = z.enum(["update_offer_pyramid", "update_tasks", "open_tipote_tool"]);

const ApplyBodySchema = z
  .object({
    type: SuggestionTypeSchema,
    payload: z.record(z.unknown()).optional(),
    suggestionId: z.string().trim().min(1).max(128).optional(),
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

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeDueDate(v: unknown): string | null {
  if (v === null) return null;
  const s = cleanString(v, 64);
  return s ? s : null;
}

function normalizeStatus(v: unknown): "todo" | "done" | null {
  const s = cleanString(v, 32).toLowerCase();
  if (!s) return null;
  if (s === "todo" || s === "done") return s;
  if (s === "completed" || s === "fait" || s === "terminé" || s === "termine") return "done";
  return null;
}

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

async function syncOfferPyramidsFlagship(args: { userId: string; pyramid: AnyRecord }) {
  // Best-effort sync: on remplace l'ensemble des rows offer_pyramids par le set de la pyramide sélectionnée.
  // (Cohérent avec /api/strategy/offer-pyramid qui fait delete+insert.)
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
    const del = await supabaseAdmin.from("offer_pyramids").delete().eq("user_id", userId);
    if (del?.error) console.error("apply syncOfferPyramidsFlagship delete error:", del.error);

    const ins = await supabaseAdmin.from("offer_pyramids").insert(rows);
    if (ins?.error) console.error("apply syncOfferPyramidsFlagship insert error:", ins.error);
  } catch (e) {
    console.error("apply syncOfferPyramidsFlagship error:", e);
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

    const { type } = parsed.data;
    const payload = parsed.data.payload ?? {};

    // ------------------------------------------------------------
    // 1) update_tasks (single or batch)
    // ------------------------------------------------------------
    if (type === "update_tasks") {
      if (!isRecord(payload)) {
        return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
      }

      // Batch mode: payload.tasks = [{ task_id/id, ...patch }]
      const tasksArr = asArray((payload as AnyRecord).tasks);
      if (tasksArr.length) {
        const updates = tasksArr
          .map((t) => asRecord(t))
          .filter(Boolean)
          .slice(0, 20) as AnyRecord[];

        if (!updates.length) {
          return NextResponse.json({ ok: false, error: "Invalid tasks batch" }, { status: 400 });
        }

        const results: AnyRecord[] = [];
        for (const t of updates) {
          const taskId = cleanString(t.task_id ?? t.id, 128);
          if (!taskId) {
            return NextResponse.json({ ok: false, error: "Missing task_id in batch" }, { status: 400 });
          }

          const patch: AnyRecord = {};

          if ("title" in t) {
            const title = cleanString(t.title, 240);
            if (!title) return NextResponse.json({ ok: false, error: "Invalid title" }, { status: 400 });
            patch.title = title;
          }

          if ("due_date" in t) patch.due_date = normalizeDueDate(t.due_date);
          if ("timeframe" in t) patch.timeframe = cleanString(t.timeframe, 48) || null;
          if ("priority" in t) patch.priority = cleanString(t.priority, 48) || null;

          if ("status" in t) {
            const st = normalizeStatus(t.status);
            if (!st) return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
            patch.status = st;
          }

          if ("done" in t && typeof t.done === "boolean") patch.status = t.done ? "done" : "todo";

          if (Object.keys(patch).length === 0) continue;

          const r = await applySingleTaskUpdate({ userId: user.id, taskId, patch });
          if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
          results.push(r.task);
        }

        return NextResponse.json({ ok: true, type, result: { tasks: results } }, { status: 200 });
      }

      // Single mode (backward compatible)
      const taskId = cleanString((payload as AnyRecord).task_id ?? (payload as AnyRecord).id, 128);
      if (!taskId) return NextResponse.json({ ok: false, error: "Missing task_id" }, { status: 400 });

      const patch: AnyRecord = {};

      if ("title" in payload) {
        const title = cleanString((payload as AnyRecord).title, 240);
        if (!title) return NextResponse.json({ ok: false, error: "Invalid title" }, { status: 400 });
        patch.title = title;
      }

      if ("due_date" in payload) patch.due_date = normalizeDueDate((payload as AnyRecord).due_date);
      if ("timeframe" in payload) patch.timeframe = cleanString((payload as AnyRecord).timeframe, 48) || null;
      if ("priority" in payload) patch.priority = cleanString((payload as AnyRecord).priority, 48) || null;

      if ("status" in payload) {
        const st = normalizeStatus((payload as AnyRecord).status);
        if (!st) return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
        patch.status = st;
      }

      if ("done" in payload && typeof (payload as AnyRecord).done === "boolean") {
        patch.status = (payload as AnyRecord).done ? "done" : "todo";
      }

      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
      }

      const r = await applySingleTaskUpdate({ userId: user.id, taskId, patch });
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

      return NextResponse.json({ ok: true, type, result: { task: r.task } }, { status: 200 });
    }

    // ------------------------------------------------------------
    // 2) update_offer_pyramid (select + edit)
    // ------------------------------------------------------------
    if (type === "update_offer_pyramid") {
      if (!isRecord(payload)) {
        return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
      }

      const selectedIndexRaw = (payload as AnyRecord).selectedIndex ?? (payload as AnyRecord).selected_index;
      const pyramidRaw = (payload as AnyRecord).pyramid ?? (payload as AnyRecord).selected_offer_pyramid;

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

      // ✅ Best-effort sync offer_pyramids
      void syncOfferPyramidsFlagship({ userId: user.id, pyramid });

      return NextResponse.json({ ok: true, type, result: { selected_offer_pyramid_index: selectedIndex } }, { status: 200 });
    }

    // ------------------------------------------------------------
    // 3) open_tipote_tool (no-op)
    // ------------------------------------------------------------
    return NextResponse.json({ ok: true, type, result: { noop: true } }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
