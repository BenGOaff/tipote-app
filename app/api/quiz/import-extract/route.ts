// app/api/quiz/import-extract/route.ts
//
// Reçoit un fichier .txt / .docx / .pdf en multipart/form-data, en extrait
// le texte côté SERVEUR (cf. lib/quizImportExtract.ts) et le renvoie au
// client. Le client appelle ensuite /api/quiz/generate en mode "import"
// avec ce texte (même flow qu'avant pour .txt).
//
// Pourquoi un endpoint séparé plutôt que d'envoyer le binaire direct à
// /api/quiz/generate ? Pour découper proprement : la généra·tion IA est
// SSE long-polling, le parsing binaire est synchrone court. Mélanger
// rendrait la route generate plus fragile et difficile à monitorer.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { detectKind, extractImportText } from "@/lib/quizImportExtract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    // Auth : on protège l'endpoint pour éviter qu'un bot poussent des
    // gros .pdf consommant CPU/mémoire. Pas de quota fin pour l'instant,
    // juste le login.
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
    }

    const kind = detectKind(file.name, file.type);
    if (!kind) {
      return NextResponse.json(
        {
          ok: false,
          error: "unsupported_format",
          hint: "Formats acceptés : .txt, .docx, .pdf.",
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractImportText(buffer, kind);
    if (!result.ok) {
      // 422 sur erreurs métier (fichier vide, pdf scanné, etc.) — le
      // client surfacera result.hint dans un toast clair.
      return NextResponse.json(result, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      text: result.text,
      kind: result.kind,
      length: result.text.length,
    });
  } catch (e) {
    console.error("[/api/quiz/import-extract] error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
