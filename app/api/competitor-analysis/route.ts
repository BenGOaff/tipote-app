// app/api/competitor-analysis/route.ts
// Competitor Analysis — CRUD + AI-powered research
// - GET: fetch existing competitor analysis for user
// - POST: save competitors list + trigger AI research (costs 1 credit)
// - PATCH: update with user corrections or uploaded document summary

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type AnyRecord = Record<string, any>;

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// ------------- Schemas -------------

const CompetitorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(400).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
});

const PostSchema = z.object({
  competitors: z.array(CompetitorSchema).min(2).max(5),
});

const PatchSchema = z.object({
  competitors: z.array(CompetitorSchema).min(2).max(5).optional(),
  competitor_details: z.record(z.string(), z.any()).optional(),
  summary: z.string().trim().max(10000).optional(),
  strengths: z.array(z.string().max(500)).max(20).optional(),
  weaknesses: z.array(z.string().max(500)).max(20).optional(),
  opportunities: z.array(z.string().max(500)).max(20).optional(),
  positioning_matrix: z.string().trim().max(5000).optional(),
  uploaded_document_summary: z.string().trim().max(10000).optional(),
});

// ------------- GET: fetch existing analysis -------------

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    let query = supabase
      .from("competitor_analyses")
      .select("*")
      .eq("user_id", user.id);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, analysis: data ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ------------- POST: save competitors + trigger AI research (1 credit) -------------

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

    const projectId = await getActiveProjectId(supabase, user.id);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { competitors } = parsed.data;

    // Charge 1 credit for AI research
    const ai = openai;
    if (!ai) {
      return NextResponse.json(
        { ok: false, error: "AI client not configured" },
        { status: 500 },
      );
    }

    await ensureUserCredits(user.id);
    const creditsResult = await consumeCredits(user.id, 1, { feature: "competitor_analysis" });
    if (creditsResult && typeof creditsResult === "object") {
      const ok = (creditsResult as any).success;
      const err = cleanString((creditsResult as any).error, 120).toUpperCase();
      if (ok === false && err.includes("NO_CREDITS")) {
        return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
      }
    }

    // Fetch user's business profile for context
    let bpQuery = supabase
      .from("business_profiles")
      .select("niche, mission, offers")
      .eq("user_id", user.id);
    if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
    const { data: businessProfile } = await bpQuery.maybeSingle();

    // AI research on competitors
    const researchResult = await researchCompetitors({
      ai,
      competitors,
      userNiche: cleanString(businessProfile?.niche, 200),
      userMission: cleanString(businessProfile?.mission, 500),
      userOffers: businessProfile?.offers ?? [],
    });

    const now = new Date().toISOString();
    const row: Record<string, any> = {
      user_id: user.id,
      competitors: competitors,
      competitor_details: researchResult.competitor_details,
      summary: researchResult.summary,
      strengths: researchResult.strengths,
      weaknesses: researchResult.weaknesses,
      opportunities: researchResult.opportunities,
      positioning_matrix: researchResult.positioning_matrix,
      status: "completed" as const,
      updated_at: now,
    };
    if (projectId) row.project_id = projectId;

    const { data, error } = await supabase
      .from("competitor_analyses")
      .upsert({ ...row, created_at: now }, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Update business_profiles with competitor_analysis_summary (best-effort)
    try {
      let bpUpdate = supabase
        .from("business_profiles")
        .update({
          competitor_analysis_summary: researchResult.summary.slice(0, 2000),
          updated_at: now,
        })
        .eq("user_id", user.id);
      if (projectId) bpUpdate = bpUpdate.eq("project_id", projectId);
      await bpUpdate;
    } catch (e) {
      console.error("Failed to update business_profiles with competitor summary:", e);
    }

    return NextResponse.json({ ok: true, analysis: data }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message ?? "").toUpperCase();
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ------------- PATCH: update with user corrections / uploaded doc -------------

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const patch: AnyRecord = {};
    const d = parsed.data;
    if (d.competitors) patch.competitors = d.competitors;
    if (d.competitor_details) patch.competitor_details = d.competitor_details;
    if (d.summary) patch.summary = d.summary;
    if (d.strengths) patch.strengths = d.strengths;
    if (d.weaknesses) patch.weaknesses = d.weaknesses;
    if (d.opportunities) patch.opportunities = d.opportunities;
    if (d.positioning_matrix) patch.positioning_matrix = d.positioning_matrix;
    if (d.uploaded_document_summary) patch.uploaded_document_summary = d.uploaded_document_summary;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, analysis: null }, { status: 200 });
    }

    patch.updated_at = new Date().toISOString();

    if (projectId) patch.project_id = projectId;

    const { data, error } = await supabase
      .from("competitor_analyses")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Update business_profiles summary (best-effort)
    if (d.summary || d.uploaded_document_summary) {
      try {
        let bpUpdate = supabase
          .from("business_profiles")
          .update({
            competitor_analysis_summary: (d.summary || d.uploaded_document_summary || "").slice(0, 2000),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
        if (projectId) bpUpdate = bpUpdate.eq("project_id", projectId);
        await bpUpdate;
      } catch (e) {
        console.error("Failed to update business_profiles with competitor summary:", e);
      }
    }

    return NextResponse.json({ ok: true, analysis: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ------------- AI Research function -------------

async function researchCompetitors(params: {
  ai: any;
  competitors: Array<{ name: string; website?: string; notes?: string }>;
  userNiche: string;
  userMission: string;
  userOffers: any[];
}): Promise<{
  competitor_details: AnyRecord;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  positioning_matrix: string;
}> {
  const { ai, competitors, userNiche, userMission, userOffers } = params;

  const systemPrompt = `Tu es Tipote, un analyste concurrentiel expert en marketing digital et stratégie business.

MISSION :
Analyser les concurrents fournis par l'utilisateur et produire un rapport concurrentiel complet et actionnable.

CONTEXTE UTILISATEUR :
- Niche : ${userNiche || "Non spécifiée"}
- Positionnement : ${userMission || "Non spécifié"}
- Offres : ${JSON.stringify(userOffers ?? [], null, 2)}

INSTRUCTIONS :
1. Pour chaque concurrent, analyse (même si tu ne connais pas tout, fais de ton mieux avec ce que tu sais) :
   - Positionnement et proposition de valeur
   - Offres principales (produits/services) avec prix si connus
   - Points forts (ce qu'ils font bien)
   - Points faibles (ce qu'ils font moins bien)
   - Canaux de communication principaux
   - Audience cible
   - Stratégie de contenu observée

2. Produis ensuite une synthèse comparative :
   - Forces de l'utilisateur par rapport aux concurrents
   - Faiblesses de l'utilisateur par rapport aux concurrents
   - Opportunités de différenciation
   - Matrice de positionnement (texte structuré)

IMPORTANT :
- Sois spécifique et actionnable, pas de généralités vagues.
- Si tu manques d'informations sur un concurrent, dis-le clairement et suggère à l'utilisateur de compléter.
- Le résumé doit donner des pistes concrètes de réflexion stratégique.
- Tout doit être en français.

FORMAT JSON STRICT :
{
  "competitor_details": {
    "competitor_name": {
      "positioning": "string",
      "value_proposition": "string",
      "main_offers": [{ "name": "string", "price": "string", "description": "string" }],
      "strengths": ["string"],
      "weaknesses": ["string"],
      "channels": ["string"],
      "target_audience": "string",
      "content_strategy": "string",
      "missing_info": ["string (info que l'IA n'a pas trouvée)"]
    }
  },
  "summary": "string (paragraphe de synthèse comparative actionnable, 200-400 mots)",
  "strengths": ["string (forces de l'utilisateur vs concurrents)"],
  "weaknesses": ["string (faiblesses de l'utilisateur vs concurrents)"],
  "opportunities": ["string (opportunités de différenciation)"],
  "positioning_matrix": "string (texte structuré de la matrice de positionnement)"
}`;

  const competitorsList = competitors
    .map((c, i) => {
      let desc = `${i + 1}. ${c.name}`;
      if (c.website) desc += ` — Site: ${c.website}`;
      if (c.notes) desc += ` — Notes: ${c.notes}`;
      return desc;
    })
    .join("\n");

  const userPrompt = `Voici les concurrents à analyser :

${competitorsList}

Analyse chaque concurrent en détail et produis le rapport complet en JSON.`;

  try {
    const resp = await ai.chat.completions.create({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 4000,
    });

    const raw = resp.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as AnyRecord;

    return {
      competitor_details: parsed.competitor_details ?? {},
      summary: cleanString(parsed.summary, 5000) || "Analyse en cours...",
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.map((s: any) => cleanString(s, 500)).filter(Boolean)
        : [],
      weaknesses: Array.isArray(parsed.weaknesses)
        ? parsed.weaknesses.map((s: any) => cleanString(s, 500)).filter(Boolean)
        : [],
      opportunities: Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map((s: any) => cleanString(s, 500)).filter(Boolean)
        : [],
      positioning_matrix: cleanString(parsed.positioning_matrix, 5000) || "",
    };
  } catch (e) {
    console.error("AI competitor research failed:", e);
    return {
      competitor_details: {},
      summary: "L'analyse IA a rencontré une erreur. Vous pouvez compléter manuellement les informations.",
      strengths: [],
      weaknesses: [],
      opportunities: [],
      positioning_matrix: "",
    };
  }
}
