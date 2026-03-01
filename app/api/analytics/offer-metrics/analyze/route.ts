// app/api/analytics/offer-metrics/analyze/route.ts
// POST: Deep AI analysis of per-offer metrics + email stats with actionable recommendations
// Adapts to user's niche, level, positioning, and completed tasks.
// ✅ In-memory cache (1h TTL) to avoid burning OpenAI quota on repeated visits
// ✅ Graceful fallback when OpenAI quota exceeded (429) or unavailable

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";

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
  lines.push("L'analyse IA est momentanément indisponible. Voici un diagnostic automatique de tes métriques :\n");

  if (!currentMetrics.length) {
    lines.push("**Aucune métrique ce mois-ci.** Commence par renseigner tes chiffres (visiteurs, inscrits, ventes) pour chaque offre.\n");
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
      lines.push("- ⚠️ **Pas de visiteurs** → Augmente ta visibilité (posts, pub, partage)");
    } else if (parseFloat(captureRate) < 20) {
      lines.push("- ⚠️ **Taux de capture faible** (<20%) → Améliore ton accroche et ta page de capture");
    }
    if (m.is_paid && signups > 0 && parseFloat(convRate) < 2) {
      lines.push("- ⚠️ **Conversion faible** (<2%) → Revois ta page de vente (preuves, offre, urgence)");
    }
    lines.push("");
  }

  lines.push("### Checklist rapide");
  lines.push("- [ ] Vérifier que chaque tunnel a suffisamment de visiteurs");
  lines.push("- [ ] Taux de capture < 20% → tester un nouveau titre / lead magnet");
  lines.push("- [ ] Taux de conversion < 2% → revoir page de vente");
  lines.push("- [ ] Taux d'ouverture email < 20% → tester de nouveaux objets");
  lines.push("\n*L'analyse IA détaillée sera disponible lors de ta prochaine visite.*");

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
    // source: "manual" = user clicked "Lancer l'analyse" (costs 1 credit)
    //         "auto"   = triggered after saving data (free)
    const source: "manual" | "auto" = body.source === "auto" ? "auto" : "manual";

    // Build cache key from user + data fingerprint
    const cacheKey = `${user.id}:${safeJson(currentMetrics)}:${safeJson(previousMetrics)}:${safeJson(emailStats)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json({ ok: true, analysis: cached, cached: true });
    }

    // Credit check: manual analysis costs 1 credit, auto-refresh is free
    if (source === "manual") {
      const balance = await ensureUserCredits(user.id);
      if (balance.total_remaining < 1) {
        return NextResponse.json(
          { ok: false, error: "Crédits insuffisants (1 crédit requis pour l'analyse).", code: "NO_CREDITS", upgrade_url: "/settings?tab=billing" },
          { status: 402 },
        );
      }
    }

    // Get business context
    let bpQuery = supabase.from("business_profiles").select("*").eq("user_id", user.id);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: businessProfile } = await bpQuery.maybeSingle();

    // Get business plan for objectives
    let planQuery = supabase.from("business_plan").select("pyramid, objectives, tasks_completed").eq("user_id", user.id);
    if (projectId) planQuery = planQuery.eq("project_id", projectId);
    const { data: businessPlan } = await planQuery.maybeSingle();

    const niche = (businessProfile as any)?.niche || "non spécifié";
    const level = (businessProfile as any)?.experience_level || (businessProfile as any)?.level || "débutant";
    const positioning = (businessProfile as any)?.mission || (businessProfile as any)?.positioning || "";
    const objectives = (businessPlan as any)?.objectives || "";
    const tasksCompleted = (businessPlan as any)?.tasks_completed || [];

    let analysis: string;

    if (openai) {
      const system = `Tu es Tipote, coach business expert en tunnels de vente, emailing et conversion.

RÈGLES :
- Écris en markdown léger (## titres, listes à puces, **gras** pour les chiffres clés)
- Chaque conseil doit être CONCRET et ACTIONNABLE, avec un EXEMPLE SIMPLE adapté à la niche de l'user
- Pas de blabla, pas de généralités. Sois direct et spécifique.
- Adapte ton vocabulaire au niveau de l'user (débutant = explications simples, avancé = jargon ok)
- Structure : Diagnostic rapide > Analyse par offre > Emailing > Plan d'action > KPIs`;

      const userMsg = `## Contexte de l'utilisateur
- Niche : ${niche}
- Niveau : ${level}
- Positionnement : ${positioning || "à définir"}
- Objectifs : ${objectives || "non définis"}
- Tâches récemment complétées : ${Array.isArray(tasksCompleted) ? tasksCompleted.slice(-5).join(", ") : "aucune"}

## Métriques par offre ce mois-ci (funnels)
${safeJson(currentMetrics)}

## Métriques par offre le mois précédent
${safeJson(previousMetrics)}

## Statistiques emails ce mois-ci
${emailStats ? safeJson(emailStats) : "Non renseignées"}

## Statistiques emails le mois précédent
${previousEmailStats ? safeJson(previousEmailStats) : "Non renseignées"}

## Ta mission d'analyse approfondie :

### 1. Diagnostic rapide (3 lignes max)
Résume la situation globale : ça progresse, stagne ou régresse ?

### 2. Analyse détaillée par offre
Pour CHAQUE offre :
- Compare les chiffres avec le mois précédent (progression / régression / stagnation)
- Identifie le goulot d'étranglement dans le tunnel : visiteurs > inscrits > ventes
- Donne 1-2 actions concrètes avec exemple adapté à la niche "${niche}"
  Exemples : "Ton taux de capture est à X% > teste un titre plus spécifique comme '[exemple adapté]'" ou "Tes visites sont faibles > poste 3 fois par semaine sur [plateforme adaptée à la niche]"

### 3. Analyse emailing (si dispo)
- Taux d'ouverture vs benchmark (20-25% = correct, >30% = bon)
- Taux de clics vs benchmark (2-5% = correct, >5% = bon)
- Actions concrètes : objet d'email, fréquence, segmentation

### 4. Plan d'action concret pour le mois prochain
3-5 actions PRIORITAIRES et SPÉCIFIQUES, classées par impact.
Chaque action doit être faisable en 1-2 jours max.
Adapte au niveau "${level}" de l'utilisateur.

### 5. KPIs à suivre
Les 3-4 chiffres clés à surveiller le mois prochain.`;

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
      analysis = `**Analyse automatique indisponible** (clé OpenAI manquante).\n\nVérifie manuellement tes ratios :\n- **Taux de capture** < 20% → Améliore ta page de capture\n- **Taux de conversion** < 2% → Revois ta page de vente\n- **Taux d'ouverture email** < 20% → Améliore tes objets d'email\n- **Visites faibles** → Poste plus souvent ou diversifie tes canaux`;
    }

    // Cache successful analysis
    setCache(cacheKey, analysis);

    // Consume 1 credit for manual analysis (auto-refresh is free)
    if (source === "manual") {
      try {
        await consumeCredits(user.id, 1, { kind: "offer_analysis", source });
      } catch { /* fail-open */ }
    }

    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
