// app/api/analytics/offer-metrics/analyze/route.ts
// POST: Deep AI analysis of per-offer metrics + email stats with actionable recommendations
// Adapts to user's niche, level, positioning, and completed tasks.
// ✅ In-memory cache (1h TTL) to avoid burning OpenAI quota on repeated visits
// ✅ Graceful fallback when OpenAI quota exceeded (429) or unavailable

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

// ── In-memory cache ──────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 200;

interface CacheEntry {
  analysis: string;
  ts: number;
}

const analysisCache = new Map<string, CacheEntry>();

function getCached(key: string): string | null {
  const entry = analysisCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    analysisCache.delete(key);
    return null;
  }
  return entry.analysis;
}

function setCache(key: string, analysis: string) {
  // Evict oldest entries if cache is too large
  if (analysisCache.size >= MAX_CACHE_SIZE) {
    const oldest = analysisCache.keys().next().value;
    if (oldest) analysisCache.delete(oldest);
  }
  analysisCache.set(key, { analysis, ts: Date.now() });
}

// ── Helpers ──────────────────────────────────────────────

function safeJson(v: unknown) {
  try { return JSON.stringify(v ?? null); } catch { return "null"; }
}

function isRateLimitError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("quota");
}

function buildFallbackAnalysis(currentMetrics: any[]): string {
  const lines: string[] = [];
  lines.push("## Analyse temporairement indisponible\n");
  lines.push("L'analyse IA est momentanement indisponible. Voici un diagnostic automatique de tes metriques :\n");

  if (!currentMetrics.length) {
    lines.push("**Aucune metrique ce mois-ci.** Commence par renseigner tes chiffres (visiteurs, inscrits, ventes) pour chaque offre.\n");
    return lines.join("\n");
  }

  for (const m of currentMetrics) {
    const name = m.offer_name || "Offre";
    lines.push(`### ${name}`);
    const visitors = m.visitors ?? 0;
    const signups = m.signups ?? 0;
    const sales = m.sales_count ?? 0;
    const captureRate = visitors > 0 ? ((signups / visitors) * 100).toFixed(1) : "0";
    const convRate = signups > 0 ? ((sales / signups) * 100).toFixed(1) : "0";

    lines.push(`- **Visiteurs** : ${visitors}`);
    lines.push(`- **Inscrits** : ${signups} (taux de capture : **${captureRate}%**)`);
    if (m.is_paid) {
      lines.push(`- **Ventes** : ${sales} (conversion : **${convRate}%**)`);
      lines.push(`- **CA** : ${(m.revenue ?? 0).toFixed(0)} €`);
    }

    // Simple diagnostics
    if (visitors === 0) {
      lines.push("- ⚠️ **Pas de visiteurs** → Augmente ta visibilite (posts, pub, partage)");
    } else if (parseFloat(captureRate) < 20) {
      lines.push("- ⚠️ **Taux de capture faible** (<20%) → Ameliore ton accroche et ta page de capture");
    }
    if (m.is_paid && signups > 0 && parseFloat(convRate) < 2) {
      lines.push("- ⚠️ **Conversion faible** (<2%) → Revois ta page de vente (preuves, offre, urgence)");
    }
    lines.push("");
  }

  lines.push("### Checklist rapide");
  lines.push("- [ ] Verifier que chaque tunnel a suffisamment de visiteurs");
  lines.push("- [ ] Taux de capture < 20% → tester un nouveau titre / lead magnet");
  lines.push("- [ ] Taux de conversion < 2% → revoir page de vente");
  lines.push("- [ ] Taux d'ouverture email < 20% → tester de nouveaux objets");
  lines.push("\n*L'analyse IA detaillee sera disponible lors de ta prochaine visite.*");

  return lines.join("\n");
}

// ── Route handler ────────────────────────────────────────

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

    // Build cache key from user + data fingerprint
    const cacheKey = `${user.id}:${safeJson(currentMetrics)}:${safeJson(previousMetrics)}:${safeJson(emailStats)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json({ ok: true, analysis: cached, cached: true });
    }

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

      try {
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
      } catch (aiErr) {
        console.error("[offer-metrics/analyze] OpenAI error:", aiErr instanceof Error ? aiErr.message : aiErr);

        if (isRateLimitError(aiErr)) {
          // Graceful fallback — don't crash, return useful diagnostic
          analysis = buildFallbackAnalysis(currentMetrics);
        } else {
          // Other OpenAI errors — still degrade gracefully
          analysis = buildFallbackAnalysis(currentMetrics);
        }
      }
    } else {
      analysis = `**Analyse automatique indisponible** (cle OpenAI manquante).\n\nVerifie manuellement tes ratios :\n- **Taux de capture** < 20% → Ameliore ta page de capture\n- **Taux de conversion** < 2% → Revois ta page de vente\n- **Taux d'ouverture email** < 20% → Ameliore tes objets d'email\n- **Visites faibles** → Poste plus souvent ou diversifie tes canaux`;
    }

    // Cache successful analysis
    setCache(cacheKey, analysis);

    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
