// app/api/analytics/offer-metrics/analyze/route.ts
// POST: Deep AI analysis of per-offer metrics + email stats with actionable recommendations
// Adapts to user's niche, level, positioning, and completed tasks.

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
    const emailStats = body.emailStats ?? null;
    const previousEmailStats = body.previousEmailStats ?? null;

    // Get business context
    let bpQuery = supabase.from("business_profiles").select("*").eq("user_id", user.id);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: businessProfile } = await bpQuery.maybeSingle();

    // Get business plan for objectives
    let planQuery = supabase.from("business_plan").select("pyramid, objectives, tasks_completed").eq("user_id", user.id);
    if (projectId) planQuery = planQuery.eq("project_id", projectId);
    const { data: businessPlan } = await planQuery.maybeSingle();

    const niche = (businessProfile as any)?.niche || "non specifie";
    const level = (businessProfile as any)?.experience_level || (businessProfile as any)?.level || "debutant";
    const positioning = (businessProfile as any)?.mission || (businessProfile as any)?.positioning || "";
    const objectives = (businessPlan as any)?.objectives || "";
    const tasksCompleted = (businessPlan as any)?.tasks_completed || [];

    let analysis: string;

    if (openai) {
      const system = `Tu es Tipote, coach business expert en tunnels de vente, emailing et conversion.

REGLES :
- Ecris en markdown leger (## titres, listes a puces, **gras** pour les chiffres cles)
- Chaque conseil doit etre CONCRET et ACTIONNABLE, avec un EXEMPLE SIMPLE adapte a la niche de l'user
- Pas de blabla, pas de generalites. Sois direct et specifique.
- Adapte ton vocabulaire au niveau de l'user (debutant = explications simples, avance = jargon ok)
- Structure : Diagnostic rapide > Analyse par offre > Emailing > Plan d'action > KPIs`;

      const userMsg = `## Contexte de l'utilisateur
- Niche : ${niche}
- Niveau : ${level}
- Positionnement : ${positioning || "a definir"}
- Objectifs : ${objectives || "non definis"}
- Taches recemment completees : ${Array.isArray(tasksCompleted) ? tasksCompleted.slice(-5).join(", ") : "aucune"}

## Metriques par offre ce mois-ci (funnels)
${safeJson(currentMetrics)}

## Metriques par offre le mois precedent
${safeJson(previousMetrics)}

## Statistiques emails ce mois-ci
${emailStats ? safeJson(emailStats) : "Non renseignees"}

## Statistiques emails le mois precedent
${previousEmailStats ? safeJson(previousEmailStats) : "Non renseignees"}

## Ta mission d'analyse approfondie :

### 1. Diagnostic rapide (3 lignes max)
Resume la situation globale : ca progresse, stagne ou regresse ?

### 2. Analyse detaillee par offre
Pour CHAQUE offre :
- Compare les chiffres avec le mois precedent (progression / regression / stagnation)
- Identifie le goulot d'etranglement dans le tunnel : visiteurs > inscrits > ventes
- Donne 1-2 actions concretes avec exemple adapte a la niche "${niche}"
  Exemples : "Ton taux de capture est a X% > teste un titre plus specifique comme '[exemple adapte]'" ou "Tes visites sont faibles > poste 3 fois par semaine sur [plateforme adaptee a la niche]"

### 3. Analyse emailing (si dispo)
- Taux d'ouverture vs benchmark (20-25% = correct, >30% = bon)
- Taux de clics vs benchmark (2-5% = correct, >5% = bon)
- Actions concretes : objet d'email, frequence, segmentation

### 4. Plan d'action concret pour le mois prochain
3-5 actions PRIORITAIRES et SPECIFIQUES, classees par impact.
Chaque action doit etre faisable en 1-2 jours max.
Adapte au niveau "${level}" de l'utilisateur.

### 5. KPIs a suivre
Les 3-4 chiffres cles a surveiller le mois prochain.`;

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
      analysis = `**Analyse automatique indisponible** (cle OpenAI manquante).\n\nVerifie manuellement tes ratios :\n- **Taux de capture** < 20% → Ameliore ta page de capture\n- **Taux de conversion** < 2% → Revois ta page de vente\n- **Taux d'ouverture email** < 20% → Ameliore tes objets d'email\n- **Visites faibles** → Poste plus souvent ou diversifie tes canaux`;
    }

    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
