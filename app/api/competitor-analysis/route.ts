// app/api/competitor-analysis/route.ts
// Competitor Analysis — CRUD + AI-powered research
// - GET: fetch existing competitor analysis for user
// - POST: save competitors list + trigger AI research (costs 1 credit)
//         Returns SSE stream (text/event-stream) with heartbeats to prevent proxy timeout.
// - PATCH: update with user corrections or uploaded document summary
// Uses OpenAI API for AI research

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getOwnerOpenAI } from "@/lib/openaiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AnyRecord = Record<string, any>;

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

const OPENAI_MODEL =
  process.env.TIPOTE_OPENAI_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-4.1";

async function callOpenAI(args: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const client = getOwnerOpenAI();
  if (!client) throw new Error("Clé API OpenAI non configurée. Contactez le support.");

  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: args.maxTokens ?? 4000,
    temperature: args.temperature ?? 0.4,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
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
// Returns SSE stream with heartbeats to prevent proxy/hosting 504 timeouts.

export async function POST(req: NextRequest) {
  // Pre-validate synchronously before starting the stream
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  let userId: string;
  let projectId: string | null;
  let competitors: Array<{ name: string; website?: string; notes?: string }>;

  try {
    supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
    projectId = await getActiveProjectId(supabase, userId);

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
    competitors = parsed.data.competitors;

    if (!getOwnerOpenAI()) {
      return NextResponse.json(
        { ok: false, error: "Clé API OpenAI non configurée. Contactez le support." },
        { status: 500 },
      );
    }

    // Charge 1 credit for AI research
    await ensureUserCredits(userId);
    const creditsResult = await consumeCredits(userId, 1, { feature: "competitor_analysis" });
    if (creditsResult && typeof creditsResult === "object") {
      const ok = (creditsResult as any).success;
      const err = cleanString((creditsResult as any).error, 120).toUpperCase();
      if (ok === false && err.includes("NO_CREDITS")) {
        return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
      }
    }
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

  // Start SSE stream — heartbeats keep the connection alive while Claude processes
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      // Send heartbeat every 5 seconds
      const heartbeat = setInterval(() => {
        try {
          sendSSE("heartbeat", { status: "analyzing" });
        } catch { /* stream closed */ }
      }, 5000);

      try {
        // Fetch business profile + existing document context in parallel
        let bpQuery = supabase
          .from("business_profiles")
          .select("niche, mission, offers")
          .eq("user_id", userId);
        if (projectId) bpQuery = bpQuery.eq("project_id", projectId);

        let docQuery = supabase
          .from("competitor_analyses")
          .select("uploaded_document_summary")
          .eq("user_id", userId);
        if (projectId) docQuery = docQuery.eq("project_id", projectId);

        const [{ data: businessProfile }, { data: existingAnalysis }] = await Promise.all([
          bpQuery.maybeSingle(),
          docQuery.maybeSingle(),
        ]);

        const uploadedDocContext = cleanString(existingAnalysis?.uploaded_document_summary, 5000);

        sendSSE("progress", { step: "Recherche IA en cours..." });

        const researchResult = await researchCompetitors({
          competitors,
          userNiche: cleanString(businessProfile?.niche, 200),
          userMission: cleanString(businessProfile?.mission, 500),
          userOffers: businessProfile?.offers ?? [],
          uploadedDocContext,
        });

        sendSSE("progress", { step: "Sauvegarde des résultats..." });

        const now = new Date().toISOString();
        const row: Record<string, any> = {
          user_id: userId,
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
          sendSSE("error", { ok: false, error: error.message });
        } else {
          // Update business_profiles (best-effort)
          try {
            let bpUpdate = supabase
              .from("business_profiles")
              .update({
                competitor_analysis_summary: researchResult.summary.slice(0, 2000),
                updated_at: now,
              })
              .eq("user_id", userId);
            if (projectId) bpUpdate = bpUpdate.eq("project_id", projectId);
            await bpUpdate;
          } catch { /* non-blocking */ }

          sendSSE("result", { ok: true, analysis: data });
        }
      } catch (e: any) {
        const msg = (e?.message ?? "").toUpperCase();
        if (msg.includes("NO_CREDITS")) {
          sendSSE("error", { ok: false, error: "NO_CREDITS" });
        } else {
          console.error("[competitor-analysis] POST stream error:", e);
          sendSSE("error", { ok: false, error: e instanceof Error ? e.message : "Unknown error" });
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Prevent nginx proxy buffering
    },
  });
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

// ------------- AI Research function (Claude) -------------

async function researchCompetitors(params: {
  competitors: Array<{ name: string; website?: string; notes?: string }>;
  userNiche: string;
  userMission: string;
  userOffers: any[];
  uploadedDocContext?: string;
}): Promise<{
  competitor_details: AnyRecord;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  positioning_matrix: string;
}> {
  const { competitors, userNiche, userMission, userOffers, uploadedDocContext } = params;

  const systemPrompt = `Tu es Tipote, un analyste concurrentiel expert en marketing digital et stratégie business.

MISSION :
Analyser les concurrents fournis par l'utilisateur et produire un rapport concurrentiel complet et actionnable.
Compare les différences entre l'offre de l'utilisateur et celles des concurrents en termes de fonctionnalités, tarifs, conditions, mots-clés, positionnement.
Pour chaque concurrent, identifie CONCRÈTEMENT ce que l'utilisateur fait mieux, moins bien, et comment il peut se différencier.

CONTEXTE UTILISATEUR :
- Niche : ${userNiche || "Non spécifiée"}
- Positionnement : ${userMission || "Non spécifié"}
- Offres : ${JSON.stringify(userOffers ?? [], null, 2)}${uploadedDocContext ? `\n\nDOCUMENT IMPORTÉ PAR L'UTILISATEUR :\nL'utilisateur a fourni un document d'analyse concurrentielle. Voici les points clés extraits — utilise-les pour enrichir et affiner ton analyse :
${uploadedDocContext}` : ""}

INSTRUCTIONS :
1. Pour chaque concurrent, analyse en détail :
   - Positionnement et proposition de valeur
   - Offres principales (produits/services) avec prix si connus
   - Points forts (ce qu'ils font bien)
   - Points faibles (ce qu'ils font moins bien)
   - Canaux de communication principaux
   - Audience cible
   - Stratégie de contenu observée
   - Mots-clés et positionnement SEO probable
   - Infos manquantes (ce que tu n'as pas trouvé)

2. Pour chaque concurrent, produis une section "face-à-face" vs l'utilisateur :
   - user_advantages : liste des avantages CONCRETS de l'utilisateur face à ce concurrent (ce que l'utilisateur fait mieux ou propose que le concurrent n'a pas)
   - user_disadvantages : liste des faiblesses CONCRÈTES de l'utilisateur face à ce concurrent (ce que le concurrent fait mieux ou propose que l'utilisateur n'a pas)
   - key_differences_summary : résumé court (2-3 phrases) des différences clés entre l'utilisateur et ce concurrent

3. Pour chaque concurrent, produis une section "actions recommandées" :
   - differentiation_strategy : stratégie précise de différenciation (comment se positionner différemment de ce concurrent, avec exemples concrets)
   - communication_focus : 2-4 messages/arguments clés à mettre en avant dans la communication pour convaincre les clients qui considèrent ce concurrent
   - offer_improvements : 2-3 améliorations concrètes à apporter à l'offre pour mieux rivaliser avec ce concurrent

4. Produis une synthèse globale comparative :
   - Forces globales de l'utilisateur par rapport à l'ensemble des concurrents
   - Faiblesses globales à corriger en priorité
   - Opportunités de différenciation (niches inexploitées, angles uniques)
   - Matrice de positionnement comparant prix/fonctionnalités/cibles

IMPORTANT :
- Sois SPÉCIFIQUE et ACTIONNABLE, pas de généralités vagues.
- Les recommandations doivent être directement exploitables (exemples : "Mets en avant ton accompagnement 1-to-1 contrairement à X qui ne propose que des formations en ligne").
- Compare les tarifs, fonctionnalités et conditions quand c'est possible.
- Si tu manques d'informations sur un concurrent, dis-le clairement dans missing_info.
- Tout doit être en français.
- CONCISION OBLIGATOIRE : chaque champ texte = 1-2 phrases max. Chaque item de liste = 1 phrase max. Le JSON complet doit rester compact.

RÉPONDS UNIQUEMENT EN JSON VALIDE avec cette structure (sans texte avant ni après le JSON) :
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
      "keywords": ["string"],
      "missing_info": ["string"],
      "user_advantages": ["string (avantage concret de l'utilisateur face à ce concurrent)"],
      "user_disadvantages": ["string (faiblesse concrète de l'utilisateur face à ce concurrent)"],
      "key_differences_summary": "string (résumé 2-3 phrases des différences clés)",
      "differentiation_strategy": "string (stratégie précise de différenciation avec exemples)",
      "communication_focus": ["string (message/argument clé à mettre en avant)"],
      "offer_improvements": ["string (amélioration concrète à apporter à l'offre)"]
    }
  },
  "summary": "string (synthèse en MARKDOWN : ## titres de sections, **mots clés en gras**, listes - pour chaque point. Sections : ## Vue d'ensemble, ## Ce que font bien tes concurrents, ## Tes avantages distinctifs, ## Priorités stratégiques. 250-400 mots, actionnable.)",
  "strengths": ["string (forces globales de l'utilisateur vs tous les concurrents)"],
  "weaknesses": ["string (faiblesses globales à corriger en priorité)"],
  "opportunities": ["string (opportunités de différenciation et niches inexploitées)"],
  "positioning_matrix": "string (matrice de positionnement avec comparaison tarifs/fonctionnalités/cibles)"
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
    const raw = await callOpenAI({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 12000,
      temperature: 0.4,
    });

    // Robust JSON extraction:
    // 1. Try markdown code blocks  ```json ... ```
    // 2. Try outermost { ... } (handles preamble/postamble text from Claude)
    // 3. Raw parse as last resort
    let parsed: AnyRecord;
    try {
      const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        parsed = JSON.parse(codeBlockMatch[1].trim());
      } else {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          parsed = JSON.parse(raw.slice(start, end + 1));
        } else {
          parsed = JSON.parse(raw);
        }
      }
    } catch (parseErr) {
      console.error("[competitor-analysis] JSON parse failed. Raw response (first 500 chars):", raw.slice(0, 500));
      throw parseErr;
    }

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
    // Rethrow so the SSE stream sends an error event (instead of silently saving a broken result)
    throw e;
  }
}
