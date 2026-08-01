// app/affiliate/api/generate/route.ts
//
// Générateur de contenu promo pour les affiliés. Volontairement bridé :
// l'affilié ne pilote pas un prompt libre, il décrit SON audience et
// choisit un format. Les faits produits, les règles d'écriture et le
// refus hors sujet sont côté serveur (lib/affiliate/generatorBrief).

import { NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { callClaude, getClaudeApiKey } from "@/lib/claude";
import { checkRateLimit } from "@/lib/aiRateLimit";
import {
  isContentProduct,
  productAffiliateLink,
} from "@/lib/affiliate/contentSpace";
import {
  GENERATOR_FORMATS,
  buildSystemPrompt,
  type GeneratorFormat,
} from "@/lib/affiliate/generatorBrief";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FIELD = 600;

function clean(v: unknown): string {
  return typeof v === "string" ? v.slice(0, MAX_FIELD).trim() : "";
}

export async function POST(req: Request) {
  const session = await getAffiliateSession();
  if (!session)
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );

  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    console.error("[affiliate/generate] clé Claude absente côté serveur");
    return NextResponse.json(
      { ok: false, reason: "unavailable" },
      { status: 503 },
    );
  }

  // 20 générations par heure et par affilié : assez pour un vrai atelier
  // d'écriture, pas assez pour transformer l'endpoint en API gratuite.
  const verdict = checkRateLimit({
    key: `affiliate-generate:${session.sa}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rate_limited",
        retryAfterSec: verdict.retryAfterSec,
      },
      { status: 429 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "bad_request" },
      { status: 400 },
    );
  }

  const product = String(payload.product ?? "");
  const format = String(payload.format ?? "") as GeneratorFormat;
  if (!isContentProduct(product) || !GENERATOR_FORMATS.includes(format)) {
    return NextResponse.json(
      { ok: false, reason: "bad_request" },
      { status: 400 },
    );
  }

  const audience = clean(payload.audience);
  if (audience.length < 3) {
    return NextResponse.json(
      { ok: false, reason: "audience_required" },
      { status: 400 },
    );
  }
  const angle = clean(payload.angle);
  const tone = clean(payload.tone);

  const userPrompt = [
    `MON AUDIENCE : ${audience}`,
    angle
      ? `ANGLE DEMANDÉ : ${angle}`
      : "ANGLE : à toi de choisir celui qui parlera le plus à cette audience.",
    tone ? `TON : ${tone}` : "",
    "Écris le contenu maintenant, en t'adressant à cette audience précise et en parlant de ses situations à elle.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await callClaude({
      apiKey,
      system: buildSystemPrompt(product, format),
      user: userPrompt,
      maxTokens: format === "article" || format === "script_long" ? 3000 : 1600,
      temperature: 0.8,
    });

    // Filet de sécurité : même briefé, un modèle peut glisser un tiret
    // cadratin. La règle de Béné est absolue sur le contenu visible.
    const text = raw.replace(/[—–]/g, "-").trim();
    const market = product === "atelier" ? "fr" : session.locale;
    const affiliateLink = await productAffiliateLink(
      product,
      market,
      session.sa,
    );

    return NextResponse.json({ ok: true, text, affiliateLink });
  } catch (err) {
    console.error("[affiliate/generate] échec de génération", err);
    return NextResponse.json(
      { ok: false, reason: "generation_failed" },
      { status: 502 },
    );
  }
}
