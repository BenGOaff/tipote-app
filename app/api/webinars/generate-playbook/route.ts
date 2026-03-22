// app/api/webinars/generate-playbook/route.ts
// POST — Generate challenge/webinar playbook content using AI
// Uses user's business context (niche, persona, offers) to generate titles + program

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function cleanStr(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    if (!openai) {
      return NextResponse.json({ ok: false, error: "AI non configurée" }, { status: 503 });
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Check credits
    const credits = await ensureUserCredits(user.id);
    if (credits.total_remaining <= 0) {
      return NextResponse.json({ ok: false, error: "Plus de crédits disponibles." }, { status: 402 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const eventType: "webinar" | "challenge" = body.event_type === "webinar" ? "webinar" : "challenge";
    const step: string = body.step || "titles"; // "titles" | "program"
    const chosenTitle: string = cleanStr(body.chosen_title);
    const userEmotion: string = cleanStr(body.emotion);
    const userObjective: string = cleanStr(body.objective);

    const projectId = await getActiveProjectId(supabase, user.id);

    // ── Load user context ──
    const profileQuery = supabase
      .from("business_profiles")
      .select("niche, mission, positioning, preferred_tone, address_form, content_locale, diagnostic_profile, diagnostic_summary, offers, storytelling")
      .eq("user_id", user.id);

    if (projectId) profileQuery.eq("project_id", projectId);

    const { data: profile } = await profileQuery.order("updated_at", { ascending: false }).limit(1).maybeSingle();

    // Load persona
    const { data: persona } = await supabase
      .from("personas")
      .select("persona_json, name, description, pains, desires, objections, current_situation, desired_situation")
      .eq("user_id", user.id)
      .eq("role", "client_ideal")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Load offers from business_plan
    const { data: planRow } = await supabase
      .from("business_plan")
      .select("plan_json")
      .eq("user_id", user.id)
      .maybeSingle();

    // ── Build context block ──
    const niche = profile?.niche || "";
    const mission = profile?.mission || "";
    const positioning = profile?.positioning || "";
    const tone = profile?.preferred_tone || "";
    const addressForm = profile?.address_form || "tu";
    const locale = profile?.content_locale || "fr";

    let targetAudience = "";
    let pains: string[] = [];
    let desires: string[] = [];
    let objections: string[] = [];

    if (persona) {
      targetAudience = persona.description || persona.name || "";
      pains = Array.isArray(persona.pains) ? persona.pains : [];
      desires = Array.isArray(persona.desires) ? persona.desires : [];
      objections = Array.isArray(persona.objections) ? persona.objections : [];
    }

    // Extract offers for context
    let offersContext = "";
    const planJson = planRow?.plan_json;
    if (planJson && typeof planJson === "object") {
      const pyramid = (planJson as Record<string, unknown>).selected_pyramid;
      if (pyramid && typeof pyramid === "object") {
        const levels = ["lead_magnet", "low_ticket", "middle_ticket", "high_ticket"];
        const parts: string[] = [];
        for (const level of levels) {
          const offer = (pyramid as Record<string, unknown>)[level];
          if (offer && typeof offer === "object") {
            const o = offer as Record<string, unknown>;
            if (o.name || o.title) {
              parts.push(`- ${level}: ${o.name || o.title} (${o.price_min ?? "?"}€ - ${o.price_max ?? "?"}€) — ${o.promise || o.description || ""}`);
            }
          }
        }
        if (parts.length) offersContext = parts.join("\n");
      }
    }

    // ── Build the system prompt ──
    const isChallenge = eventType === "challenge";
    const eventLabel = isChallenge ? "challenge" : "webinaire";
    const daysLabel = isChallenge ? "4 jours" : "1 session";

    const systemPrompt = `Tu es un expert en marketing, copywriting et création de ${eventLabel}s à forte valeur perçue.
Ta mission est d'aider l'utilisateur à créer un ${eventLabel} irrésistible, spécifique, actionnable et orienté résultats.

CONTEXTE DE L'UTILISATEUR :
- Niche : ${niche || "non précisée"}
- Mission : ${mission || "non précisée"}
- Positionnement : ${positioning || "non précisé"}
- Ton préféré : ${tone || "professionnel et bienveillant"}
- Forme d'adresse : ${addressForm}
- Langue : ${locale}
${targetAudience ? `\nCIBLE / CLIENT IDÉAL :\n${targetAudience}` : ""}
${pains.length ? `\nPOINTS DE DOULEUR :\n${pains.map((p) => `- ${p}`).join("\n")}` : ""}
${desires.length ? `\nDÉSIRS :\n${desires.map((d) => `- ${d}`).join("\n")}` : ""}
${objections.length ? `\nOBJECTIONS COURANTES :\n${objections.map((o) => `- ${o}`).join("\n")}` : ""}
${offersContext ? `\nOFFRES EXISTANTES :\n${offersContext}` : ""}

RÈGLES :
- Ne jamais être vague ou générique
- Toujours adapter à la cible et à la niche
- Écrire comme un copywriter expert
- Utiliser la forme "${addressForm}" pour s'adresser à l'audience
- Répondre en ${locale === "fr" ? "français" : locale}
- Format de réponse : JSON valide uniquement, pas de markdown autour`;

    let userPrompt = "";
    let responseFormat = "";

    if (step === "titles") {
      responseFormat = `Réponds en JSON : { "titles": [ { "number": 1, "title": "TITRE", "description": "description courte du concept" }, ... ] }`;

      userPrompt = `Génère exactement 15 titres de ${eventLabel}${isChallenge ? " (format " + daysLabel + ")" : ""} pour cette cible.

${userObjective ? `Objectif de la cible : ${userObjective}` : ""}
${userEmotion ? `Émotion recherchée : ${userEmotion}` : ""}

RÈGLES POUR LES TITRES :
- Intégrer une transformation et un désir fort
${userEmotion ? "- Intégrer l'émotion fournie" : ""}
- Varier les angles : rapidité, simplicité, exclusivité, système, secrets, anti-méthode, résultat sans effort excessif
- Ne jamais être générique
- Format : "TITRE : description du ${eventLabel}"
${isChallenge ? '- Tu peux inclure "X jours pour..." mais pas obligatoire partout' : '- Tu peux inclure "Comment..." ou "Les X secrets de..." mais varie les angles'}

${responseFormat}`;
    } else if (step === "program") {
      const programDays = isChallenge ? 4 : 1;

      if (isChallenge) {
        responseFormat = `Réponds en JSON :
{
  "program": {
    "title": "${chosenTitle}",
    "days": [
      {
        "day": 1,
        "theme": "thème clair orienté résultat",
        "objective": "pourquoi c'est important",
        "exercises": [
          { "title": "Titre exercice", "description": "Description claire", "why": "Pourquoi c'est pertinent", "how_to_help": "Comment aider les participants" }
        ]
      }
    ],
    "bonus_ideas": ["idée 1", "idée 2", "idée 3"],
    "offer_pitch_tips": ["conseil 1", "conseil 2", "conseil 3"],
    "promo_strategies": ["stratégie 1", "stratégie 2"]
  }
}`;

        userPrompt = `Le titre choisi est : "${chosenTitle}"

Crée un challenge complet sur ${programDays} jours.

Pour CHAQUE jour :
- Un thème clair orienté résultat
- L'objectif du jour (pourquoi c'est important)
- 3 à 5 idées d'exercices concrets et actionnables, chacun avec description, pertinence et comment aider les participants

Structure spécifique :
- Jour 1 : Introduction + apport de valeur + premier exercice
- Jour 2 : Approfondissement du sujet + exercice
- Jour 3 : Plan d'action + exercice + introduction de l'offre
- Jour 4 : Session live/coaching + vente de l'offre + ouverture paiements

Ajoute aussi :
- 3 idées de bonus à offrir (pertinents pour la cible)
- 3 conseils pour pitcher l'offre sans être pushy
- 2 stratégies de promo (early bird, places limitées, etc.)

${responseFormat}`;
      } else {
        // Webinaire
        responseFormat = `Réponds en JSON :
{
  "program": {
    "title": "${chosenTitle}",
    "sections": [
      {
        "section": 1,
        "title": "titre de la section",
        "duration_minutes": 10,
        "content": "ce qui est abordé",
        "engagement_tip": "comment garder l'audience engagée"
      }
    ],
    "bonus_ideas": ["idée 1", "idée 2", "idée 3"],
    "offer_pitch_tips": ["conseil 1", "conseil 2", "conseil 3"],
    "promo_strategies": ["stratégie 1", "stratégie 2"],
    "total_duration_minutes": 60
  }
}`;

        userPrompt = `Le titre choisi est : "${chosenTitle}"

Crée un programme de webinaire complet (environ 60 minutes).

Structure recommandée :
- Section 1 (5-10 min) : Accroche + présentation + promesse
- Section 2 (15-20 min) : Contenu de valeur — enseigner un concept clé
- Section 3 (10-15 min) : Démonstration / preuve sociale / cas concret
- Section 4 (10 min) : Le problème que l'audience ne peut pas résoudre seule
- Section 5 (10-15 min) : Présentation de l'offre + bonus + urgence
- Section 6 (5-10 min) : Q&A + derniers rappels + CTA

Pour chaque section :
- Titre clair
- Durée estimée
- Contenu détaillé
- Un tip pour garder l'audience engagée

Ajoute aussi :
- 3 idées de bonus à offrir pendant le webinaire
- 3 conseils pour pitcher l'offre sans être pushy
- 2 stratégies de promo (early bird, places limitées, etc.)

${responseFormat}`;
      }
    } else {
      return NextResponse.json({ ok: false, error: `Step inconnu: ${step}` }, { status: 400 });
    }

    // ── Call AI ──
    const completion = await openai.chat.completions.create({
      ...cachingParams("playbook", { temperature: 0.9 }),
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(raw);
    } catch {
      result = { error: "Réponse IA invalide", raw: raw.slice(0, 500) };
    }

    // Consume 1 credit
    await consumeCredits(user.id, 1).catch(() => {});

    return NextResponse.json({ ok: true, step, event_type: eventType, data: result });
  } catch (e: any) {
    console.error("[webinars/generate-playbook] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
