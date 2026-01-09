// app/api/strategy/offer-pyramid/route.ts

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai } from "@/lib/openaiClient";

type AnyRecord = Record<string, any>;

function isRecord(v: unknown): v is AnyRecord {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asRecord(v: unknown): AnyRecord | null {
  return isRecord(v) ? (v as AnyRecord) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cleanString(v: unknown, maxLen = 4000): string {
  if (typeof v !== "string") return "";
  const s = v.trim().replace(/\s+/g, " ");
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function safeJsonParse(raw: string): AnyRecord | null {
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function normalizeDueDate(raw: unknown): string | null {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return raw.toISOString().slice(0, 10);
  }
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizePriority(raw: unknown): "low" | "medium" | "high" {
  const v = cleanString(raw, 40).toLowerCase();
  if (v === "high" || v === "haute") return "high";
  if (v === "low" || v === "basse") return "low";
  return "medium";
}

function keyOf(title: string, due: string | null) {
  return `${title}__${due ?? ""}`;
}

async function syncStrategyTasksToProjectTasks(args: {
  userId: string;
  tasks: { title: string; due_date: string | null; priority: "low" | "medium" | "high" }[];
}) {
  const { userId, tasks } = args;

  // 1) read existing strategy tasks to preserve status
  const existingRes = await supabaseAdmin
    .from("project_tasks")
    .select("id, title, due_date, status")
    .eq("user_id", userId)
    .eq("source", "strategy")
    .limit(2000);

  const existing = Array.isArray(existingRes.data) ? existingRes.data : [];
  const statusByKey = new Map<string, string>();
  for (const t of existing) {
    const title = typeof t.title === "string" ? t.title : "";
    const due = typeof t.due_date === "string" ? t.due_date : null;
    const st = typeof t.status === "string" ? t.status : "todo";
    if (title) statusByKey.set(keyOf(title, due), st);
  }

  // 2) delete old strategy tasks
  const delRes = await supabaseAdmin.from("project_tasks").delete().eq("user_id", userId).eq("source", "strategy");
  if (delRes.error) {
    return { ok: false as const, error: delRes.error.message };
  }

  // 3) insert new
  const payload = tasks.map((t) => {
    const preserved = statusByKey.get(keyOf(t.title, t.due_date));
    return {
      user_id: userId,
      title: t.title,
      due_date: t.due_date,
      priority: t.priority,
      status: preserved ?? "todo",
      source: "strategy",
    };
  });

  if (!payload.length) return { ok: true as const, inserted: 0 as const };

  const insRes = await supabaseAdmin.from("project_tasks").insert(payload);
  if (insRes.error) {
    return { ok: false as const, error: insRes.error.message };
  }

  return { ok: true as const, inserted: payload.length as const };
}

export async function PATCH(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);
      return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
    }
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json().catch(() => null);
    const selectedIndex = typeof body?.selectedIndex === "number" ? body.selectedIndex : null;

    const pyramid = body?.pyramid;
    const offer = body?.offer;
    const chosenPayload = pyramid !== undefined ? pyramid : offer !== undefined ? offer : undefined;

    if (selectedIndex === null || selectedIndex < 0) {
      return NextResponse.json({ error: "selectedIndex is required" }, { status: 400 });
    }

    // load plan
    const planRes = await supabase
      .from("business_plan")
      .select("id, plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (planRes.error || !planRes.data) {
      return NextResponse.json({ error: "business_plan not found" }, { status: 404 });
    }

    const currentPlan = (planRes.data.plan_json || {}) as AnyRecord;

    const offerPyramids = Array.isArray(currentPlan.offer_pyramids) ? currentPlan.offer_pyramids : [];
    if (offerPyramids.length > 0 && selectedIndex >= offerPyramids.length) {
      return NextResponse.json({ error: "selectedIndex out of range" }, { status: 400 });
    }

    const chosenPyramid =
      chosenPayload !== undefined
        ? chosenPayload
        : offerPyramids.length > 0
          ? offerPyramids[selectedIndex]
          : null;

    // update selection
    currentPlan.selected_offer_pyramid_index = selectedIndex;
    currentPlan.selected_offer_pyramid = chosenPyramid ?? null;

    // generate missing parts only
    const hasPersona = isRecord(currentPlan.persona) && Object.keys(currentPlan.persona).length > 0;
    const hasPlan90 =
      isRecord(currentPlan.plan_90_days) ||
      isRecord(currentPlan.plan90) ||
      isRecord(currentPlan.tasks_by_timeframe);

    let generated = false;

    if (!hasPersona || !hasPlan90) {
      const ai = openai;
      if (!ai) {
        return NextResponse.json(
          { success: false, error: "OPENAI_API_KEY_OWNER is not set (strategy generation disabled)" },
          { status: 500 },
        );
      }

      // load business_profile for context
      const profileRes = await supabase.from("business_profiles").select("*").eq("user_id", userId).maybeSingle();
      const businessProfile = profileRes.data ?? null;

      const systemPrompt = `Tu es un stratège business. Tu dois produire un JSON STRICT (aucun texte autour).

OBJECTIF :
À partir du profil utilisateur + de la pyramide d'offres choisie, génère :
1) persona
2) plan d'action 90 jours avec tâches réparties sur 30/60/90 jours

FORMAT EXACT :
{
  "persona": {
    "title": "string",
    "pains": ["..."],
    "desires": ["..."],
    "channels": ["..."]
  },
  "plan_90_days": {
    "tasks_by_timeframe": {
      "d30": [{ "task":"", "due_date":"YYYY-MM-DD", "priority":"low|medium|high" }],
      "d60": [{ "task":"", "due_date":"YYYY-MM-DD", "priority":"low|medium|high" }],
      "d90": [{ "task":"", "due_date":"YYYY-MM-DD", "priority":"low|medium|high" }]
    }
  }
}

RÈGLES :
- 6 à 10 tâches par bucket (d30/d60/d90), pas de doublons
- due_date doit être dans les 90 prochains jours (date réaliste)
- tâches concrètes, actionnables, adaptées à la maturité
- channels: déduis des préférences de contenu si présentes, sinon propose 3-5 canaux réalistes
- Français naturel
- JSON valide uniquement`;

      const userPrompt = `## business_profile
${JSON.stringify(businessProfile, null, 2)}

## pyramide_choisie
${JSON.stringify(chosenPyramid, null, 2)}

## plan_json_existant (si utile)
${JSON.stringify(currentPlan, null, 2)}
`;

      const aiResponse = await ai.chat.completions.create({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
      });

      const content = aiResponse.choices[0]?.message?.content;
      if (!content) {
        return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
      }

      const parsed = safeJsonParse(content);
      if (!parsed) {
        console.error("Failed to parse AI JSON:", content);
        return NextResponse.json({ error: "Failed to parse AI JSON (see server logs)" }, { status: 502 });
      }

      if (!hasPersona && isRecord(parsed.persona)) {
        currentPlan.persona = parsed.persona;
      }

      if (!hasPlan90 && isRecord(parsed.plan_90_days)) {
        currentPlan.plan_90_days = parsed.plan_90_days;
      }

      currentPlan.strategy_generated_at = new Date().toISOString();
      generated = true;

      // sync tasks into project_tasks (source=strategy)
      const plan90 = asRecord(currentPlan.plan_90_days) ?? asRecord(currentPlan.plan90);
      const grouped = asRecord(plan90?.tasks_by_timeframe ?? currentPlan.tasks_by_timeframe);
      const d30 = asArray(grouped?.d30);
      const d60 = asArray(grouped?.d60);
      const d90 = asArray(grouped?.d90);

      const flat = [...d30, ...d60, ...d90]
        .map((x) => asRecord(x))
        .filter(Boolean)
        .map((t) => {
          const title = cleanString(t?.task ?? t?.title, 180);
          const due_date = normalizeDueDate(t?.due_date ?? t?.date ?? t?.scheduled_for);
          const priority = normalizePriority(t?.priority);
          return title ? { title, due_date, priority } : null;
        })
        .filter(Boolean) as { title: string; due_date: string | null; priority: "low" | "medium" | "high" }[];

      const syncRes = await syncStrategyTasksToProjectTasks({
        userId,
        tasks: flat,
      });

      if (!syncRes.ok) {
        console.error("Task sync error:", syncRes.error);
        // On ne bloque pas l'UI si le sync échoue : plan_json est déjà enrichi.
      }
    }

    const { error: updateError } = await supabase
      .from("business_plan")
      .update({ plan_json: currentPlan, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating business_plan:", updateError);
      return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      generated,
      plan_json: currentPlan,
    });
  } catch (err) {
    console.error("Unhandled error in PATCH /api/strategy/offer-pyramid:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
