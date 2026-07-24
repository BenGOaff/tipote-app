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
// Qualité de génération. Défaut "medium" : "high" fait dépasser les ~100s de
// timeout Cloudflare (erreur 524, aucune image). "medium" reste rapide ET
// gpt-image-2 medium est deja bien meilleur que gpt-image-1. Surchargeable
// via OPENAI_IMAGE_QUALITY (low | medium | high | auto) pour ceux qui ont une
// infra sans ce plafond. Valeur inconnue -> medium.
const IMAGE_QUALITY = ((): "low" | "medium" | "high" | "auto" => {
  const q = process.env.OPENAI_IMAGE_QUALITY?.trim().toLowerCase();
  return q === "low" || q === "medium" || q === "high" || q === "auto" ? q : "medium";
})();

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

    const res = await client.images.generate(
      {
        model: IMAGE_MODEL,
        prompt,
        size,
        n: 1,
        // gpt-image-1/2 : low | medium | high | auto. Défaut "medium",
        // surchargeable via OPENAI_IMAGE_QUALITY.
        quality: IMAGE_QUALITY,
      } as Parameters<typeof client.images.generate>[0],
      // Echec RAPIDE et PROPRE : on coupe a 90s (< ~100s Cloudflare) et on
      // desactive les retries du SDK qui, en s'empilant, depassaient le
      // plafond -> 524 opaque. Ici, un modele indisponible ou une generation
      // trop lente renvoie une vraie erreur JSON exploitable, jamais un 524.
      { timeout: 90_000, maxRetries: 0 },
    );

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
