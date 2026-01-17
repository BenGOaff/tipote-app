import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";

const BodySchema = z.object({
  metricId: z.string().min(1),
  metrics: z.any(),
  previousMetrics: z.any().nullable().optional(),
});

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "null";
  }
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await req.json();
    const parsed = BodySchema.parse(json);

    // Récupération contexte business (best-effort, sans casser si colonnes diffèrent)
    const { data: businessProfile } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const metrics = parsed.metrics ?? {};
    const previous = parsed.previousMetrics ?? null;

    let analysis: string;

    if (openai) {
      const system = `Tu es Tipote, coach business pragmatique. Tu écris en français, en markdown léger (titres courts + listes). Pas de blabla, uniquement recommandations actionnables.`;
      const userMsg = `Contexte business (peut être incomplet) :
${safeJson(businessProfile)}

Métriques du mois :
${safeJson(metrics)}

Métriques du mois précédent (si dispo) :
${safeJson(previous)}

Ta mission :
1) Diagnostiquer ce qui progresse / stagne / baisse.
2) Donner 5 actions concrètes et priorisées (avec pourquoi).
3) Donner 3 idées de contenus à produire le mois prochain (alignées sur les métriques).
4) Finir par une mini-checklist "Semaine 1 / Semaine 2 / Semaine 3 / Semaine 4".`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        temperature: 0.4,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      });

      analysis = completion.choices?.[0]?.message?.content?.trim() || "Analyse indisponible.";
    } else {
      // fallback sans OpenAI (ne bloque pas la page)
      analysis =
        "Analyse indisponible (clé OpenAI owner manquante). \n\n" +
        "- Vérifie tes métriques et cherche les goulots (visiteurs → inscrits → ventes).\n" +
        "- Objectif du mois : améliorer *un* ratio (capture ou conversion) avant d’augmenter le volume.\n";
    }

    // Persist dans la table metrics (RLS OK via service server + user vérifié)
    const { error: updErr } = await supabase
      .from("metrics")
      .update({ ai_analysis: analysis, updated_at: new Date().toISOString() })
      .eq("id", parsed.metricId)
      .eq("user_id", user.id);

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, analysis }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
