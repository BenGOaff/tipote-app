// app/api/analytics/analyze-metrics/route.ts
// POST: AI analysis of monthly metrics with actionable recommendations
// ✅ In-memory cache (1h TTL) to avoid burning OpenAI quota on repeated visits
// ✅ Graceful fallback when OpenAI quota exceeded (429) or unavailable

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { getActiveProjectId } from "@/lib/projects/activeProject";

const BodySchema = z.object({
  metricId: z.string().min(1),
  metrics: z.any(),
  previousMetrics: z.any().nullable().optional(),
});

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
  if (analysisCache.size >= MAX_CACHE_SIZE) {
    const oldest = analysisCache.keys().next().value;
    if (oldest) analysisCache.delete(oldest);
  }
  analysisCache.set(key, { analysis, ts: Date.now() });
}

// ── Helpers ──────────────────────────────────────────────

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "null";
  }
}

function isRateLimitError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("quota");
}

const FALLBACK_ANALYSIS =
  "## Analyse temporairement indisponible\n\n" +
  "L'analyse IA est momentanement indisponible. Voici les points cles a verifier :\n\n" +
  "- **Visiteurs** → Tes sources de trafic sont-elles actives ? (posts, pub, partage)\n" +
  "- **Taux de capture** < 20% → Ameliore ton accroche et ta page de capture\n" +
  "- **Taux de conversion** < 2% → Revois ta page de vente (preuves, offre, urgence)\n" +
  "- **Taux d'ouverture email** < 20% → Teste de nouveaux objets d'email\n\n" +
  "**Objectif du mois** : ameliorer *un seul* ratio (capture ou conversion) avant d'augmenter le volume.\n\n" +
  "*L'analyse IA detaillee sera disponible lors de ta prochaine visite.*";

// ── Route handler ────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  try {
    const json = await req.json();
    const parsed = BodySchema.parse(json);

    const metrics = parsed.metrics ?? {};
    const previous = parsed.previousMetrics ?? null;

    // Check cache
    const cacheKey = `${user.id}:${parsed.metricId}:${safeJson(metrics)}:${safeJson(previous)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      // Still persist to DB if needed, then return
      let updQuery = supabase
        .from("metrics")
        .update({ ai_analysis: cached, updated_at: new Date().toISOString() })
        .eq("id", parsed.metricId)
        .eq("user_id", user.id);
      if (projectId) updQuery = updQuery.eq("project_id", projectId);
      await updQuery;

      return NextResponse.json({ ok: true, analysis: cached, cached: true }, { status: 200 });
    }

    // Récupération contexte business (best-effort, sans casser si colonnes diffèrent)
    let bpQuery = supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: businessProfile } = await bpQuery.maybeSingle();

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

      try {
        const completion = await openai.chat.completions.create({
          ...cachingParams("analytics"),
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          max_completion_tokens: 4000,
        } as any);

        analysis = completion.choices?.[0]?.message?.content?.trim() || "Analyse indisponible.";
      } catch (aiErr) {
        console.error("[analyze-metrics] OpenAI error:", aiErr instanceof Error ? aiErr.message : aiErr);
        analysis = FALLBACK_ANALYSIS;
      }
    } else {
      // fallback sans OpenAI (ne bloque pas la page)
      analysis =
        "Analyse indisponible (clé OpenAI owner manquante). \n\n" +
        "- Vérifie tes métriques et cherche les goulots (visiteurs → inscrits → ventes).\n" +
        "- Objectif du mois : améliorer *un* ratio (capture ou conversion) avant d'augmenter le volume.\n";
    }

    // Cache the result
    setCache(cacheKey, analysis);

    // Persist dans la table metrics (RLS OK via service server + user vérifié)
    let updQuery = supabase
      .from("metrics")
      .update({ ai_analysis: analysis, updated_at: new Date().toISOString() })
      .eq("id", parsed.metricId)
      .eq("user_id", user.id);
    if (projectId) updQuery = updQuery.eq("project_id", projectId);
    const { error: updErr } = await updQuery;

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
