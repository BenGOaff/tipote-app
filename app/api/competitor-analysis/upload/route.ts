// app/api/competitor-analysis/upload/route.ts
// Upload an existing competitor research document (PDF, DOCX, TXT)
// AI summarizes the document and stores it as competitor analysis
// Uses Claude (Anthropic API) for AI analysis

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function resolveApiKey(): string {
  return (
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    ""
  );
}

function resolveModel(): string {
  return (
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929"
  );
}

async function callClaude(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const model = resolveModel();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: typeof args.maxTokens === "number" ? args.maxTokens : 4000,
      temperature: typeof args.temperature === "number" ? args.temperature : 0.3,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API error (${res.status}): ${t || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const parts = Array.isArray(json?.content) ? json.content : [];
  const text = parts
    .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "";
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
    const apiKey = resolveApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Clé API IA non configurée. Contactez le support." },
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

    const summaryResult = await summarizeDocument({
      apiKey,
      documentText: textContent,
      userNiche: cleanString(businessProfile?.niche, 200),
      userMission: cleanString(businessProfile?.mission, 500),
    });

    // Upsert competitor analysis
    const now = new Date().toISOString();
    const upsertPayload: Record<string, any> = {
      user_id: user.id,
      competitors: summaryResult.competitors_extracted,
      competitor_details: summaryResult.competitor_details,
      summary: summaryResult.summary,
      strengths: summaryResult.strengths,
      weaknesses: summaryResult.weaknesses,
      opportunities: summaryResult.opportunities,
      positioning_matrix: summaryResult.positioning_matrix,
      uploaded_document_summary: summaryResult.document_summary,
      status: "completed",
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

    // Update business_profiles (best-effort)
    try {
      let bpUpdate = supabase
        .from("business_profiles")
        .update({
          competitor_analysis_summary: summaryResult.summary.slice(0, 2000),
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
    console.error("[competitor-analysis/upload] POST error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

async function summarizeDocument(params: {
  apiKey: string;
  documentText: string;
  userNiche: string;
  userMission: string;
}): Promise<{
  competitors_extracted: Array<{ name: string; website?: string; notes?: string }>;
  competitor_details: Record<string, any>;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  positioning_matrix: string;
  document_summary: string;
}> {
  const { apiKey, documentText, userNiche, userMission } = params;

  const systemPrompt = `Tu es Tipote, un analyste concurrentiel expert.

MISSION :
L'utilisateur a uploadé un document contenant une analyse concurrentielle déjà réalisée.
Tu dois extraire et structurer les informations clés en JSON.

CONTEXTE UTILISATEUR :
- Niche : ${userNiche || "Non spécifiée"}
- Positionnement : ${userMission || "Non spécifié"}

INSTRUCTIONS :
1. Identifie les concurrents mentionnés dans le document.
2. Extrais les informations clés pour chaque concurrent.
3. Produis une synthèse comparative par rapport à l'utilisateur.
4. Identifie forces, faiblesses et opportunités.
5. Fais un résumé court du document.

RÉPONDS UNIQUEMENT EN JSON VALIDE avec cette structure :
{
  "competitors_extracted": [{ "name": "string", "website": "string", "notes": "string" }],
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
      "missing_info": []
    }
  },
  "summary": "string (synthèse comparative actionnable, 200-400 mots)",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "opportunities": ["string"],
  "positioning_matrix": "string",
  "document_summary": "string (résumé court du document uploadé, 2-3 phrases)"
}`;

  try {
    const raw = await callClaude({
      apiKey,
      system: systemPrompt,
      user: `DOCUMENT UPLOADÉ :\n\n${documentText}`,
      maxTokens: 4000,
      temperature: 0.3,
    });

    // Extract JSON from response (Claude might wrap it in markdown code blocks)
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
      competitor_details: parsed.competitor_details ?? {},
      summary: cleanString(parsed.summary, 5000) || "Résumé du document importé.",
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.map((s: any) => cleanString(s, 500)).filter(Boolean)
        : [],
      weaknesses: Array.isArray(parsed.weaknesses)
        ? parsed.weaknesses.map((s: any) => cleanString(s, 500)).filter(Boolean)
        : [],
      opportunities: Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map((s: any) => cleanString(s, 500)).filter(Boolean)
        : [],
      positioning_matrix: cleanString(parsed.positioning_matrix, 5000),
      document_summary: cleanString(parsed.document_summary, 2000) || "Document importé et analysé.",
    };
  } catch (e) {
    console.error("AI document summarization failed:", e);
    return {
      competitors_extracted: [],
      competitor_details: {},
      summary: "Erreur lors de l'analyse du document. Complétez manuellement.",
      strengths: [],
      weaknesses: [],
      opportunities: [],
      positioning_matrix: "",
      document_summary: "Erreur de traitement.",
    };
  }
}
