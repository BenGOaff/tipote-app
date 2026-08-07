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
        { ok: false, reason: "unsupported_format" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractImportText(buffer, kind);
    if (!result.ok) {
      // 422 sur erreurs métier (fichier vide, pdf scanné, etc.). On
      // renvoie la RAISON : c'est l'écran qui la met en mots, dans la
      // langue de la créatrice. Jamais `error.message`, qui est écrit
      // pour nous et pas pour elle (cf. lib/quiz/importFailure.ts).
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
    // Le détail part dans les logs, pas dans le toast : `error.message`
    // porte des noms de variables minifiés qui ne veulent rien dire pour
    // la créatrice, et qui masquent le vrai symptôme quand elle nous le
    // recopie.
    return NextResponse.json({ ok: false, reason: "extract_failed" }, { status: 500 });
  }
}
