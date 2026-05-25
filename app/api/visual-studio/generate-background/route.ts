// app/api/visual-studio/generate-background/route.ts
//
// Génère un FOND via OpenAI (images) pour le studio visuel.
// - Clé OWNER côté serveur (getOwnerOpenAI) — jamais exposée au client.
// - Auth requise (utilisateur connecté) pour protéger la clé d'un abus.
// - PAS de crédits ici : le studio est sur le dashboard affilié ; les crédits
//   IA ne concernent QUE Tipote (règle Béné).
// - L'IA ne génère QUE l'image (le texte est ajouté en calque par l'éditeur).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getOwnerOpenAI } from "@/lib/openaiClient";
import { buildBackgroundPrompt, isAiStyleId, aiSizeForRatio } from "@/lib/visualStudio/aiPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";

export async function POST(req: NextRequest) {
  try {
    // Garde-fou auth : on ne laisse pas un anonyme cramer la clé OpenAI.
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const client = getOwnerOpenAI();
    if (!client) {
      return NextResponse.json({ ok: false, error: "AI non configurée (clé manquante)." }, { status: 503 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const styleId = body.style;
    if (!isAiStyleId(styleId)) {
      return NextResponse.json({ ok: false, error: "Style invalide" }, { status: 400 });
    }
    const intent = typeof body.intent === "string" ? body.intent : null;
    const brandColors = Array.isArray(body.brandColors)
      ? (body.brandColors.filter((c) => typeof c === "string") as string[])
      : [];
    const ratio = typeof body.ratio === "number" && isFinite(body.ratio) ? body.ratio : 1;
    const size = aiSizeForRatio(ratio);

    const prompt = buildBackgroundPrompt({ intent, styleId, brandColors });

    const res = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size,
      n: 1,
      // gpt-image-1 : low | medium | high | auto. "medium" = bon rapport qualité/coût.
      quality: "medium",
    } as Parameters<typeof client.images.generate>[0]);

    const b64 = res.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ ok: false, error: "Aucune image renvoyée" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, dataUrl: `data:image/png;base64,${b64}` });
  } catch (e) {
    console.error("[visual-studio/generate-background] error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
