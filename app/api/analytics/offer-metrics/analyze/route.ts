// app/api/analytics/offer-metrics/analyze/route.ts
// POST: AI analysis of per-offer metrics with actionable recommendations

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

function safeJson(v: unknown) {
  try { return JSON.stringify(v ?? null); } catch { return "null"; }
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  try {
    const body = await req.json();
    const currentMetrics = body.currentMetrics ?? [];
    const previousMetrics = body.previousMetrics ?? [];

    // Get business context
    let bpQuery = supabase.from("business_profiles").select("*").eq("user_id", user.id);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: businessProfile } = await bpQuery.maybeSingle();

    let analysis: string;

    if (openai) {
      const system = `Tu es Tipote, coach business spécialisé en tunnels de vente et conversion. Tu écris en français, en markdown léger (titres courts + listes). Pas de blabla, uniquement recommandations actionnables et concrètes.`;

      const userMsg = `Contexte business :
${safeJson(businessProfile)}

Métriques par offre ce mois-ci :
${safeJson(currentMetrics)}

Métriques par offre le mois précédent :
${safeJson(previousMetrics)}

Ta mission :
1) Pour chaque offre, diagnostiquer ce qui progresse / stagne / baisse en comparant les deux mois.
2) Identifier les goulots d'étranglement dans le tunnel (visiteurs → inscrits → ventes) pour chaque offre.
3) Donner des recommandations concrètes et priorisées par offre :
   - Si le taux de capture est faible : améliorer la page de capture, modifier le CTA, tester un autre lead magnet
   - Si les visites sont faibles : poster plus souvent, diversifier les canaux, améliorer le SEO
   - Si le taux de conversion vente est faible : revoir le positionnement, améliorer la page de vente, ajuster le prix
   - Si le CA/visiteur est faible : augmenter le panier moyen, proposer des upsells
4) Donner un plan d'action global pour le mois prochain (3-5 actions prioritaires).
5) Terminer par un résumé des KPI clés à suivre.`;

      const completion = await openai.chat.completions.create({
        ...cachingParams("offer-analytics"),
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        max_completion_tokens: 4000,
      } as any);

      analysis = completion.choices?.[0]?.message?.content?.trim() || "Analyse indisponible.";
    } else {
      analysis = `**Analyse automatique indisponible** (clé OpenAI manquante).\n\nVérifie manuellement tes ratios :\n- **Taux de capture** < 20% → Améliore ta page de capture\n- **Taux de conversion** < 2% → Revois ta page de vente\n- **Visites faibles** → Poste plus souvent ou diversifie tes canaux`;
    }

    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
