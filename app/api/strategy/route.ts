// app/api/strategy/route.ts

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";

type AnyRecord = Record<string, any>;

function isRecord(v: unknown): v is AnyRecord {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asRecord(v: unknown): AnyRecord | null {
  return isRecord(v) ? (v as AnyRecord) : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function cleanString(v: unknown, maxLen = 4000): string {
  if (typeof v !== "string") return "";
  const s = v.trim().replace(/\s+/g, " ");
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function safeJsonParse(raw: string): AnyRecord | null {
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

/**
 * UI Tipote (PyramidSelection) lit:
 * - pyramid.name
 * - pyramid.strategy_summary
 * - lead_magnet/low_ticket/high_ticket : { title, composition, purpose, format }
 *
 * On enrichit aussi avec "price" et "insight" (non utilisé par l'UI, mais utile).
 */
function normalizeOffer(o: AnyRecord | null): AnyRecord {
  const title = cleanString(o?.title ?? o?.nom, 140);
  const composition = cleanString(o?.composition, 2200);
  const purpose = cleanString(o?.purpose ?? o?.insight, 900);
  const format = cleanString(o?.format, 250);

  const price =
    typeof o?.price === "number"
      ? o.price
      : typeof o?.prix === "number"
        ? o.prix
        : null;

  return {
    title,
    composition,
    purpose,
    format,
    ...(price !== null ? { price } : {}),
  };
}

function normalizePyramid(p: AnyRecord | null, idx: number): AnyRecord {
  const id = String(p?.id ?? idx);
  const name = cleanString(p?.name ?? p?.nom ?? `Pyramide ${idx + 1}`, 160);
  const strategy_summary = cleanString(p?.strategy_summary ?? p?.logique ?? "", 4000);

  const lead = asRecord(p?.lead_magnet) ?? asRecord(p?.leadMagnet) ?? asRecord(p?.lead_magnet_offer);
  const low = asRecord(p?.low_ticket) ?? asRecord(p?.lowTicket) ?? asRecord(p?.low_ticket_offer);
  const high = asRecord(p?.high_ticket) ?? asRecord(p?.highTicket) ?? asRecord(p?.high_ticket_offer);

  return {
    id,
    name,
    strategy_summary,
    lead_magnet: normalizeOffer(lead),
    low_ticket: normalizeOffer(low),
    high_ticket: normalizeOffer(high),
  };
}

function pyramidsLookUseful(pyramids: unknown[]): boolean {
  if (!Array.isArray(pyramids) || pyramids.length < 3) return false;

  const hasOffer = (o: AnyRecord | null) =>
    !!cleanString(o?.title, 80) ||
    !!cleanString(o?.composition, 120) ||
    !!cleanString(o?.purpose, 80) ||
    !!cleanString(o?.format, 40);

  const hasP = (p: AnyRecord | null) => {
    if (!p) return false;
    const lead = asRecord(p.lead_magnet);
    const low = asRecord(p.low_ticket);
    const high = asRecord(p.high_ticket);
    const hasName = !!cleanString(p.name, 40);
    const hasSum = !!cleanString(p.strategy_summary, 120);
    return hasName && (hasSum || hasOffer(lead) || hasOffer(low) || hasOffer(high));
  };

  return hasP(asRecord(pyramids[0])) && hasP(asRecord(pyramids[1])) && hasP(asRecord(pyramids[2]));
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);
      return NextResponse.json(
        { success: false, error: `Failed to get session: ${sessionError.message}` },
        { status: 500 },
      );
    }

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;

    // 0) Lire plan existant (idempotence)
    const { data: existingPlan, error: existingPlanError } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingPlanError) {
      console.error("Error checking existing business_plan:", existingPlanError);
    }

    const existingPlanJson = (existingPlan?.plan_json ?? null) as any;
    const existingOfferPyramids = existingPlanJson ? asArray(existingPlanJson.offer_pyramids) : [];
    const existingSelectedIndex =
      typeof existingPlanJson?.selected_offer_pyramid_index === "number"
        ? existingPlanJson.selected_offer_pyramid_index
        : null;

    // Si l'user a déjà choisi, on ne régénère pas
    if (typeof existingSelectedIndex === "number") {
      return NextResponse.json(
        { success: true, planId: null, skipped: true, reason: "already_selected" },
        { status: 200 },
      );
    }

    // Si déjà généré proprement, on ne régénère pas
    if (pyramidsLookUseful(existingOfferPyramids)) {
      return NextResponse.json(
        { success: true, planId: null, skipped: true, reason: "already_generated" },
        { status: 200 },
      );
    }

    // 1) Lire business_profile (onboarding)
    const { data: businessProfile, error: profileError } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !businessProfile) {
      console.error("Business profile error:", profileError);
      return NextResponse.json(
        { success: false, error: `Business profile missing: ${profileError?.message ?? "unknown"}` },
        { status: 400 },
      );
    }

    // 2) Charger ressources (pour améliorer la qualité)
    const { data: resources, error: resourcesError } = await supabase.from("resources").select("*");
    if (resourcesError) console.error("Error loading resources:", resourcesError);

    const { data: resourceChunks, error: chunksError } = await supabase.from("resource_chunks").select("*");
    if (chunksError) console.error("Error loading resource_chunks:", chunksError);

    // On limite la taille envoyée au modèle (qualité > quantité)
    const MAX_CHUNKS = 24;
    const limitedChunks = Array.isArray(resourceChunks) ? resourceChunks.slice(0, MAX_CHUNKS) : [];

    // 3) Prompt renforcé (3 orientations fixes + intégration offres existantes + ressources)
    const systemPrompt = `Tu es un stratège business spécialisé dans la création de pyramides d'offres pour solopreneurs.

TA MISSION :
Génère EXACTEMENT 3 pyramides d'offres DISTINCTES, chacune avec une orientation stratégique différente :
- Pyramide A : SIMPLICITÉ (démarrage rapide, peu de création, réutilise l'existant)
- Pyramide B : EXPERTISE (valorise compétences uniques, montée en valeur)
- Pyramide C : SCALABILITÉ (automatisation, revenus récurrents / passifs, systèmes)

RÈGLES IMPORTANTES (anti-qualité-pourave) :
- Les 3 pyramides doivent être VRAIMENT différentes (pas 3 variations du même produit).
- Tu dois utiliser le CONTEXTE utilisateur et, si l'utilisateur a déjà des offres, les intégrer intelligemment OU proposer une alternative plus cohérente, en expliquant le pourquoi.
- Chaque niveau doit avoir :
  - title (nom accrocheur, spécifique à la niche)
  - format (ex: PDF, mini-cours, formation, coaching, abonnement...)
  - price (nombre, ex: 0 / 19 / 47 / 297 / 997)
  - composition (ce que contient l'offre, concret, livrables)
  - purpose (l'objectif / transformation)
  - insight (1 phrase percutante: pourquoi ça convertit à ce niveau)
- La logique globale de chaque pyramide doit être expliquée en 1 phrase (strategy_summary).

STRUCTURE EXACTE À RENVOYER (JSON strict, pas de texte autour) :
{
  "offer_pyramids": [
    {
      "id": "A",
      "name": "Pyramide A — Simplicité",
      "strategy_summary": "1 phrase",
      "lead_magnet": { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
      "low_ticket": { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" },
      "high_ticket": { "title":"", "format":"", "price":0, "composition":"", "purpose":"", "insight":"" }
    }
  ]
}

CONTRAINTES :
- offer_pyramids doit contenir EXACTEMENT 3 objets, ids: "A", "B", "C"
- Champs texte non vides (pas de placeholders)
- Français naturel, précis, orienté action
- Utilise explicitement les ressources internes si elles contiennent des frameworks, structures, bonnes pratiques, idées d'offres, pricing, etc.
- Ne renvoie QUE du JSON valide.
`;

    // On pousse fortement l'IA à piocher dans les ressources :
    // - on fournit: profil + offres existantes + extraits de ressources
    const userPrompt = `## CONTEXTE UTILISATEUR (business_profiles)
${JSON.stringify(businessProfile, null, 2)}

## RESSOURCES INTERNES (métadonnées)
${JSON.stringify(resources || [], null, 2)}

## EXTRACTS (resource_chunks) — utilise ces infos pour améliorer la qualité (frameworks, exemples, pricing, angles)
${JSON.stringify(limitedChunks, null, 2)}

## INSTRUCTION SPÉCIALE
Si des offres existantes sont présentes dans le profil (name/type/price/sales),
- propose une intégration intelligente (upsell, re-packaging, repositionnement),
- ou explique pourquoi tu proposes une alternative et en quoi elle est meilleure pour l'objectif et la maturité.
`;

    const ai = openai;
    if (!ai) {
      return NextResponse.json(
        { success: false, error: "OPENAI_API_KEY_OWNER is not set (strategy generation disabled)" },
        { status: 500 },
      );
    }

    const aiResponse = await ai.chat.completions.create({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const content = aiResponse.choices[0]?.message?.content;
    if (!content) {
      console.error("Empty AI response");
      return NextResponse.json({ success: false, error: "Empty AI response" }, { status: 502 });
    }

    const parsed = safeJsonParse(content);
    if (!parsed) {
      console.error("Failed to parse AI JSON:", content);
      return NextResponse.json(
        { success: false, error: "Failed to parse AI JSON (see server logs for raw output)" },
        { status: 502 },
      );
    }

    const offerPyramidsRaw = asArray(parsed.offer_pyramids);
    const normalizedOfferPyramids = offerPyramidsRaw.slice(0, 3).map((p: any, idx: number) => normalizePyramid(asRecord(p), idx));

    if (normalizedOfferPyramids.length !== 3) {
      console.error("Invalid offer_pyramids count:", offerPyramidsRaw);
      return NextResponse.json(
        { success: false, error: "AI returned invalid offer_pyramids (must be exactly 3)" },
        { status: 502 },
      );
    }

    // 4) On conserve ce qui existe déjà dans le plan, mais on écrit offer_pyramids et timestamp
    const basePlan: AnyRecord = isRecord(existingPlanJson) ? existingPlanJson : {};
    const plan_json: AnyRecord = {
      ...basePlan,
      offer_pyramids: normalizedOfferPyramids,
      generated_at: new Date().toISOString(),
    };

    const { data: savedPlan, error: planError } = await supabase
      .from("business_plan")
      .upsert(
        {
          user_id: userId,
          plan_json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .maybeSingle();

    if (planError) {
      console.error("Error upserting business_plan:", planError);
      return NextResponse.json(
        { success: false, error: `Failed to save business plan: ${planError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, planId: (savedPlan as any)?.id ?? null }, { status: 200 });
  } catch (err) {
    console.error("Unhandled error in /api/strategy:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
