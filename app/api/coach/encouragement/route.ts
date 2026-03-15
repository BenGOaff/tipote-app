// app/api/coach/encouragement/route.ts
// Generates a smart, contextual encouragement sentence for the dashboard.
// FREE (no credits) — cached in localStorage client-side, short prompt.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

function toStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const projectId = await getActiveProjectId(supabase, userId);

    // 1. Fetch done tasks (recent first, max 5)
    let doneQuery = supabaseAdmin
      .from("project_tasks")
      .select("title, status, source, updated_at")
      .eq("user_id", userId)
      .eq("status", "done")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (projectId) doneQuery = doneQuery.eq("project_id", projectId);

    const { data: doneTasks } = await doneQuery;

    if (!doneTasks || doneTasks.length === 0) {
      return NextResponse.json({ ok: true, text: null }, { status: 200 });
    }

    // 2. Fetch total task counts for context
    let countQuery = supabaseAdmin
      .from("project_tasks")
      .select("status")
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (projectId) countQuery = countQuery.eq("project_id", projectId);

    const { data: allTasks } = await countQuery;
    const total = allTasks?.length ?? 0;
    const done = allTasks?.filter((t: any) => t.status === "done").length ?? 0;

    // 3. Fetch plan focus for context
    let planQuery = supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (projectId) planQuery = planQuery.eq("project_id", projectId);

    const { data: planRows } = await planQuery;
    const planJson = planRows?.[0]?.plan_json as Record<string, any> | null;

    const plan90 = planJson?.plan_90_days ?? planJson?.plan90 ?? planJson?.plan_90;
    const focus = toStr(plan90?.focus ?? planJson?.focus ?? "");

    // 4. Build prompt
    const doneList = doneTasks.map((t: any) => `- ${toStr(t.title)}`).join("\n");

    const apiKey =
      process.env.CLAUDE_API_KEY_OWNER?.trim() ||
      process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      "";

    if (!apiKey) {
      return NextResponse.json({ ok: true, text: null }, { status: 200 });
    }

    const model =
      process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
      process.env.CLAUDE_MODEL?.trim() ||
      "claude-sonnet-4-5-20250929";

    const systemPrompt = `Tu es le coach business de l'utilisateur sur Tipote. Tu dois écrire UNE SEULE phrase d'encouragement pour le tableau de bord.

Règles :
- 1 phrase maximum, 15-30 mots
- Tutoie l'utilisateur
- Analyse POURQUOI ces tâches sont importantes dans le parcours business (pas juste les citer)
- Relie les actions accomplies à leur impact concret sur le business
- Ton chaleureux, direct, motivant — comme un mentor bienveillant
- PAS de guillemets autour des noms de tâches
- PAS de pourcentage ni de compteur (pas de "3/12")
- PAS d'émojis
- Termine par une note encourageante tournée vers l'avenir

Exemples de BONNES phrases :
- "Ton persona est bien défini, tu sais exactement à qui tu parles — c'est la base pour tout le reste, bravo !"
- "Ta stratégie de contenu prend forme, tu construis ta visibilité étape par étape."
- "Tu as posé les fondations de ton offre et de ton tunnel, tu es prêt à attirer tes premiers clients."

Exemples de MAUVAISES phrases (à éviter) :
- "Tu as terminé 3 tâches sur 12, continue !" (trop générique)
- "C'est top, tu as fini « Définir le persona » !" (citation brute)
- "Tu y es presque ! 85% complété." (chiffres sans contexte)`;

    const userPrompt = `Contexte business :
- Objectif actuel : ${focus || "Développer son activité"}
- Progression : ${done} tâches terminées sur ${total}

Tâches récemment accomplies :
${doneList}

Écris ta phrase d'encouragement :`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: 150,
          temperature: 0.8,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
    } catch (e: any) {
      if (/aborted|abort/i.test(e?.message)) {
        return NextResponse.json({ ok: true, text: null }, { status: 200 });
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.error("Coach encouragement Claude error:", res.status);
      return NextResponse.json({ ok: true, text: null }, { status: 200 });
    }

    const json = (await res.json()) as any;
    const text = json.content?.[0]?.text?.trim() || null;

    // Return with cache hint (client should cache for ~30min)
    return NextResponse.json(
      { ok: true, text, doneCount: done, totalCount: total },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=1800" },
      },
    );
  } catch (err) {
    console.error("Coach encouragement error:", err);
    return NextResponse.json({ ok: true, text: null }, { status: 200 });
  }
}
