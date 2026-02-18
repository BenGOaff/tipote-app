// app/api/competitor-analysis/upload/route.ts
// Upload an existing competitor research document (PDF, DOCX, TXT)
// AI extracts competitors from the document to pre-fill the analysis form
// Uses OpenAI API for AI extraction

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getOwnerOpenAI } from "@/lib/openaiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    temperature: args.temperature ?? 0.3,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!allowedTypes.includes(file.type) && !["txt", "pdf", "docx", "md"].includes(ext ?? "")) {
      return NextResponse.json(
        { ok: false, error: "Format non supporté. Utilisez TXT, PDF, DOCX ou MD." },
        { status: 400 },
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Fichier trop volumineux (max 5 Mo)." },
        { status: 400 },
      );
    }

    // Extract text from file
    let textContent = "";
    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.type === "text/plain" || ext === "txt" || ext === "md") {
      textContent = buffer.toString("utf-8");
    } else if (ext === "docx" || file.type.includes("wordprocessingml")) {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        textContent = result.value;
      } catch (e) {
        return NextResponse.json(
          { ok: false, error: "Erreur lors de la lecture du fichier Word." },
          { status: 400 },
        );
      }
    } else if (ext === "pdf" || file.type === "application/pdf") {
      // Basic text extraction from PDF - extract readable text
      textContent = buffer.toString("utf-8").replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, " ");
      // If mostly garbled, inform user
      const readableRatio = textContent.replace(/\s/g, "").length / Math.max(1, buffer.length);
      if (readableRatio < 0.1) {
        return NextResponse.json(
          { ok: false, error: "Le PDF ne contient pas de texte lisible. Essayez avec un format TXT ou DOCX." },
          { status: 400 },
        );
      }
    }

    if (!textContent.trim() || textContent.trim().length < 50) {
      return NextResponse.json(
        { ok: false, error: "Le fichier semble vide ou trop court. Minimum 50 caractères." },
        { status: 400 },
      );
    }

    // Truncate to reasonable length for AI processing
    const maxChars = 15000;
    if (textContent.length > maxChars) {
      textContent = textContent.slice(0, maxChars) + "\n\n[...document tronqué...]";
    }

    // Check API key
    if (!getOwnerOpenAI()) {
      return NextResponse.json(
        { ok: false, error: "Clé API OpenAI non configurée. Contactez le support." },
        { status: 500 },
      );
    }

    await ensureUserCredits(user.id);
    const creditsResult = await consumeCredits(user.id, 1, { feature: "competitor_analysis_upload" });
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

    // Extract competitors from document (no full analysis — user will launch that separately)
    const extractResult = await extractFromDocument({
      documentText: textContent,
      userNiche: cleanString(businessProfile?.niche, 200),
      userMission: cleanString(businessProfile?.mission, 500),
    });

    // Upsert: save extracted competitors + document key points.
    // Full analysis fields are cleared so the user knows they need to run "Lancer l'analyse IA".
    const now = new Date().toISOString();
    const upsertPayload: Record<string, any> = {
      user_id: user.id,
      competitors: extractResult.competitors_extracted,
      // Save rich key points so the main analysis route can use them as context
      uploaded_document_summary: extractResult.document_key_points,
      // Clear stale analysis data from any previous run
      competitor_details: null,
      summary: null,
      strengths: null,
      weaknesses: null,
      opportunities: null,
      positioning_matrix: null,
      status: "draft",
      updated_at: now,
      created_at: now,
    };
    if (projectId) upsertPayload.project_id = projectId;

    const { data, error } = await supabase
      .from("competitor_analyses")
      .upsert(upsertPayload, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      analysis: data,
      document_summary: extractResult.document_summary,
    }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message ?? "").toUpperCase();
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    console.error("[competitor-analysis/upload] POST error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// Lightweight extraction: identify competitors + save document key points.
// No full competitive analysis — that's done later by the main POST route.
async function extractFromDocument(params: {
  documentText: string;
  userNiche: string;
  userMission: string;
}): Promise<{
  competitors_extracted: Array<{ name: string; website?: string; notes?: string }>;
  document_key_points: string;
  document_summary: string;
}> {
  const { documentText, userNiche, userMission } = params;

  const systemPrompt = `Tu es Tipote, un assistant d'analyse concurrentielle.

MISSION :
L'utilisateur a uploadé un document (analyse concurrentielle, benchmark, notes, etc.).
Tu dois :
1. Identifier les concurrents mentionnés dans le document.
2. Extraire les informations clés sur chaque concurrent pour pré-remplir le formulaire.
3. Produire un résumé structuré des points clés du document (pour enrichir l'analyse IA ensuite).

CONTEXTE UTILISATEUR :
- Niche : ${userNiche || "Non spécifiée"}
- Positionnement : ${userMission || "Non spécifié"}

IMPORTANT :
- Le champ "notes" de chaque concurrent doit contenir toutes les informations pertinentes extraites du document sur ce concurrent (prix, forces, faiblesses, positionnement, etc.) en quelques phrases concises.
- Le champ "document_key_points" doit être un résumé structuré et détaillé (300-500 mots) des insights concurrentiels du document — il sera utilisé comme contexte supplémentaire pour l'analyse IA.
- Tout en français.

RÉPONDS UNIQUEMENT EN JSON VALIDE avec cette structure :
{
  "competitors_extracted": [
    {
      "name": "string (nom du concurrent)",
      "website": "string (URL si mentionnée, sinon vide)",
      "notes": "string (toutes les infos clés sur ce concurrent extraites du document)"
    }
  ],
  "document_key_points": "string (résumé structuré 300-500 mots des insights concurrentiels du document)",
  "document_summary": "string (résumé très court 2-3 phrases de ce que contient le document)"
}`;

  try {
    const raw = await callOpenAI({
      system: systemPrompt,
      user: `DOCUMENT UPLOADÉ :\n\n${documentText}`,
      maxTokens: 2000,
      temperature: 0.2,
    });

    let jsonStr = raw;
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return {
      competitors_extracted: Array.isArray(parsed.competitors_extracted)
        ? parsed.competitors_extracted.slice(0, 5).map((c: any) => ({
            name: cleanString(c?.name, 200) || "Concurrent",
            website: cleanString(c?.website, 400),
            notes: cleanString(c?.notes, 2000),
          }))
        : [],
      document_key_points: cleanString(parsed.document_key_points, 5000) || "",
      document_summary: cleanString(parsed.document_summary, 500) || "Document importé.",
    };
  } catch (e) {
    console.error("AI document extraction failed:", e);
    return {
      competitors_extracted: [],
      document_key_points: "",
      document_summary: "Erreur de traitement du document.",
    };
  }
}
