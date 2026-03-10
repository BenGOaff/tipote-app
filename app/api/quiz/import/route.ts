// app/api/quiz/import/route.ts
// Parse an uploaded file (txt, pdf, docx, xlsx) and extract quiz structure using Claude.
// Costs 6 credits.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function getClaudeApiKey(): string {
  return (
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    ""
  );
}

function getClaudeModel(): string {
  return (
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "claude-sonnet-4-5-20250929"
  );
}

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "txt" || ext === "csv") {
    return buffer.toString("utf-8");
  }

  if (ext === "pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (ext === "docx" || ext === "doc") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      lines.push(csv);
    }
    return lines.join("\n\n");
  }

  throw new Error(`Format de fichier non supporté : .${ext}`);
}

const SYSTEM_PROMPT = `Tu es un expert en extraction de données de quiz.

On te donne le contenu textuel d'un fichier (PDF, Word, Excel ou texte) contenant un quiz existant.

Ta mission : extraire et structurer les données du quiz en JSON.

RÈGLES :
- Identifie les questions, leurs options de réponse, et les profils résultat.
- Chaque option de réponse doit être mappée vers un profil résultat (result_index, commençant à 0).
- Si le mapping option → profil n'est pas explicite dans le document, déduis-le logiquement.
- Si les profils résultat ne sont pas clairement définis, crée-les à partir du contexte.
- Conserve le texte original autant que possible (ne reformule pas les questions ni les réponses).
- Génère un titre si aucun n'est présent.
- Génère une courte introduction si elle n'est pas présente.

FORMAT DE SORTIE : JSON strict, pas de markdown, pas de commentaires.
{
  "title": "Titre du quiz",
  "introduction": "Texte d'intro (2-3 phrases)",
  "questions": [
    {
      "question_text": "La question",
      "options": [
        { "text": "Option A", "result_index": 0 },
        { "text": "Option B", "result_index": 1 }
      ]
    }
  ],
  "results": [
    {
      "title": "Nom du profil",
      "description": "Description du profil (2-3 phrases)",
      "insight": "Prise de conscience liée à ce profil",
      "projection": "Ce que ça implique pour la suite"
    }
  ],
  "cta_text": "Texte du CTA principal (si trouvé, sinon chaîne vide)"
}

IMPORTANT :
- Réponds UNIQUEMENT en JSON valide.
- Ne perds aucune question ni aucune réponse du document source.
- result_index doit être cohérent entre questions et résultats.`;

export async function POST(req: NextRequest) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Clé API Claude manquante côté serveur." },
      { status: 500 },
    );
  }

  let supabase;
  let userId: string;

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
  } catch {
    return NextResponse.json({ ok: false, error: "Auth error" }, { status: 500 });
  }

  // Parse multipart form
  let file: File;
  try {
    const formData = await req.formData();
    const f = formData.get("file");
    if (!f || !(f instanceof File)) {
      return NextResponse.json({ ok: false, error: "Aucun fichier fourni." }, { status: 400 });
    }
    file = f;
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "Fichier trop volumineux (max 10 Mo)." },
      { status: 400 },
    );
  }

  // Extract text
  let text: string;
  try {
    text = await extractTextFromFile(file);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Impossible de lire le fichier." },
      { status: 400 },
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      { ok: false, error: "Le fichier est vide ou ne contient pas de texte lisible." },
      { status: 400 },
    );
  }

  // Truncate very large files
  const maxChars = 30_000;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + "\n\n[... contenu tronqué]";
  }

  // Check & consume credits
  try {
    await ensureUserCredits(userId);
    const creditsResult = await consumeCredits(userId, 6, { feature: "quiz_import" });
    if (creditsResult && typeof creditsResult === "object") {
      const ok = (creditsResult as any).success;
      const err = String((creditsResult as any).error ?? "").toUpperCase();
      if (ok === false && err.includes("NO_CREDITS")) {
        return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
      }
    }
  } catch (e: any) {
    const msg = String(e?.message ?? "").toUpperCase();
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    throw e;
  }

  // Call Claude to extract quiz structure
  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getClaudeModel(),
        max_tokens: 8000,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Voici le contenu du fichier "${file.name}" :\n\n${text}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[quiz/import] Claude API error:", res.status, errText.slice(0, 300));
      return NextResponse.json(
        { ok: false, error: `Erreur d'analyse (${res.status}). Réessaie.` },
        { status: 500 },
      );
    }

    const json = (await res.json()) as any;
    const parts = Array.isArray(json?.content) ? json.content : [];
    const raw = parts
      .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
      .filter(Boolean)
      .join("")
      .trim();

    // Parse JSON from response
    let quiz: any;
    try {
      const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        quiz = JSON.parse(codeBlockMatch[1].trim());
      } else {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          quiz = JSON.parse(raw.slice(start, end + 1));
        } else {
          quiz = JSON.parse(raw);
        }
      }
    } catch {
      console.error("[quiz/import] JSON parse failed. Raw:", raw.slice(0, 300));
      return NextResponse.json(
        { ok: false, error: "L'IA n'a pas pu extraire un quiz valide de ce fichier. Vérifie le format." },
        { status: 422 },
      );
    }

    // Basic validation
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Aucune question détectée dans le fichier." },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, quiz });
  } catch (err: any) {
    console.error("[quiz/import] Error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Erreur lors de l'analyse du fichier." },
      { status: 500 },
    );
  }
}
