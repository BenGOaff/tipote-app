// app/api/coach/actions/apply/route.ts
// Applique une suggestion du Coach IA en DB (premium: "modifie la réalité").
//
// - Auth via cookies (getSupabaseServerClient)
// - Mutations via supabaseAdmin + filtre user_id (pattern déjà utilisé dans /api/tasks/[id])
//
// Types supportés (MVP):
// - update_tasks: patch un task dans public.project_tasks
// - update_offer_pyramid: met à jour business_plan.plan_json.selected_offer_pyramid_index + selected_offer_pyramid
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function normalizeDueDate(v: unknown): string | null {
  if (v === null) return null;
  const s = cleanString(v);
  return s ? s : null;
}

function normalizeStatus(v: unknown): "todo" | "done" | null {
  const s = cleanString(v);
  if (!s) return null;
  const low = s.toLowerCase();
  if (low === "todo" || low === "done") return low;
  if (low === "completed" || low === "fait" || low === "terminé" || low === "termine") return "done";
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
    // 1) update_tasks
    // ------------------------------------------------------------
    if (type === "update_tasks") {
      if (!isRecord(payload)) {
        return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
      }

      const taskId = cleanString(payload.task_id) || cleanString(payload.id);
      if (!taskId) {
        return NextResponse.json({ ok: false, error: "Missing task_id" }, { status: 400 });
      }

      const update: Record<string, unknown> = {};
      if ("title" in payload) {
        const title = cleanString(payload.title);
        if (!title) return NextResponse.json({ ok: false, error: "Invalid title" }, { status: 400 });
        update.title = title;
      }

      if ("due_date" in payload) {
        update.due_date = normalizeDueDate(payload.due_date);
      }

      if ("status" in payload) {
        const st = normalizeStatus(payload.status);
        if (!st) return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
        update.status = st;
      }

      if ("priority" in payload) {
        const pr = cleanString(payload.priority);
        // on reste tolérant: priority est libre côté DB (string|null)
        update.priority = pr;
      }

      // Compat: done boolean -> status
      if ("done" in payload && typeof payload.done === "boolean") {
        update.status = payload.done ? "done" : "todo";
      }

      if (Object.keys(update).length === 0) {
        return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from("project_tasks")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("user_id", user.id)
        .select("id, title, status, due_date, priority, timeframe, updated_at")
        .maybeSingle();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ ok: false, error: "Task not found" }, { status: 404 });

      return NextResponse.json({ ok: true, type, result: { task: data } }, { status: 200 });
    }

    // ------------------------------------------------------------
    // 2) update_offer_pyramid
    // ------------------------------------------------------------
    if (type === "update_offer_pyramid") {
      if (!isRecord(payload)) {
        return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
      }

      const selectedIndexRaw = (payload as Record<string, unknown>).selectedIndex ?? (payload as Record<string, unknown>).selected_index;
      const pyramidRaw = (payload as Record<string, unknown>).pyramid ?? (payload as Record<string, unknown>).selected_offer_pyramid;

      const selectedIndex = toNumber(selectedIndexRaw);
      if (selectedIndex === null || !Number.isFinite(selectedIndex) || selectedIndex < 0) {
        return NextResponse.json({ ok: false, error: "Invalid selectedIndex" }, { status: 400 });
      }

      if (!isRecord(pyramidRaw)) {
        return NextResponse.json({ ok: false, error: "Invalid pyramid" }, { status: 400 });
      }

      // Read existing plan_json
      const { data: planRow, error: planErr } = await supabaseAdmin
        .from("business_plan")
        .select("plan_json")
        .eq("user_id", user.id)
        .maybeSingle();

      if (planErr) return NextResponse.json({ ok: false, error: planErr.message }, { status: 400 });
      if (!planRow) return NextResponse.json({ ok: false, error: "Business plan not found" }, { status: 404 });

      const planJson = isRecord((planRow as any).plan_json) ? ((planRow as any).plan_json as Record<string, unknown>) : {};

      const nextPlanJson: Record<string, unknown> = {
        ...planJson,
        selected_offer_pyramid_index: selectedIndex,
        selected_offer_pyramid: pyramidRaw,
      };

      const { data, error } = await supabaseAdmin
        .from("business_plan")
        .update({ plan_json: nextPlanJson, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select("plan_json")
        .maybeSingle();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ ok: false, error: "Business plan not found" }, { status: 404 });

      return NextResponse.json(
        { ok: true, type, result: { selected_offer_pyramid_index: selectedIndex } },
        { status: 200 },
      );
    }

    // ------------------------------------------------------------
    // 3) open_tipote_tool (no-op)
    // ------------------------------------------------------------
    return NextResponse.json({ ok: true, type, result: { noop: true } }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
