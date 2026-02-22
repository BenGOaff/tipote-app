// app/api/persona/enrich/route.ts
// Regenerate enriched persona using onboarding data + competitor analysis + coach history
// Costs 1 credit. Updates business_profiles.mission and business_profiles.niche.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { buildEnhancedPersonaPrompt } from "@/lib/prompts/persona/system";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type AnyRecord = Record<string, any>;

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export async function POST() {
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

    const ai = openai;
    if (!ai) {
      return NextResponse.json(
        { ok: false, error: "AI client not configured" },
        { status: 500 },
      );
    }

    // Charge 1 credit
    await ensureUserCredits(user.id);
    const creditsResult = await consumeCredits(user.id, 1, { feature: "persona_enrich" });
    if (creditsResult && typeof creditsResult === "object") {
      const ok = (creditsResult as any).success;
      const err = cleanString((creditsResult as any).error, 120).toUpperCase();
      if (ok === false && err.includes("NO_CREDITS")) {
        return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
      }
    }

    // Gather all available data
    const bpQ = supabase.from("business_profiles").select("*").eq("user_id", user.id);
    if (projectId) bpQ.eq("project_id", projectId);

    const ofQ = supabase.from("onboarding_facts").select("key,value").eq("user_id", user.id);
    if (projectId) ofQ.eq("project_id", projectId);

    const caQ = supabase.from("competitor_analyses").select("summary,strengths,weaknesses,opportunities").eq("user_id", user.id);
    if (projectId) caQ.eq("project_id", projectId);

    const cmQ = supabase.from("coach_messages").select("content,role").eq("user_id", user.id);
    if (projectId) cmQ.eq("project_id", projectId);

    const pQ = supabase.from("personas").select("persona_json").eq("user_id", user.id).eq("role", "client_ideal");
    if (projectId) pQ.eq("project_id", projectId);

    const plQ = supabase.from("business_plan").select("plan_json").eq("user_id", user.id);
    if (projectId) plQ.eq("project_id", projectId);

    const [
      { data: businessProfile },
      { data: onboardingFactsRows },
      { data: competitorAnalysis },
      { data: coachMessages },
      { data: existingPersona },
      { data: businessPlan },
    ] = await Promise.all([
      bpQ.maybeSingle(),
      ofQ,
      caQ.maybeSingle(),
      cmQ.order("created_at", { ascending: false }).limit(20),
      pQ.maybeSingle(),
      plQ.maybeSingle(),
    ]);

    // Build onboarding facts map
    const onboardingFacts: Record<string, unknown> = {};
    if (Array.isArray(onboardingFactsRows)) {
      for (const row of onboardingFactsRows) {
        if (row?.key) onboardingFacts[String(row.key)] = row.value;
      }
    }

    // Build coach context
    const coachContext = Array.isArray(coachMessages)
      ? coachMessages
          .filter((m: any) => m.role === "user")
          .slice(0, 10)
          .map((m: any) => cleanString(m.content, 300))
          .filter(Boolean)
          .join("\n---\n")
      : "";

    const systemPrompt = buildEnhancedPersonaPrompt({ locale: "fr" });

    // ✅ Separate owner data from persona-relevant data to prevent mixing
    const diagnosticProfile = (businessProfile?.diagnostic_profile ?? null) as AnyRecord | null;

    // Extract owner-specific fields (constraints, preferences) — these are NOT about the persona
    const ownerConstraints: AnyRecord = {};
    const personaRelevantDiagnostic: AnyRecord = {};
    if (diagnosticProfile && typeof diagnosticProfile === "object") {
      const ownerKeys = ["non_negotiables", "constraints", "root_fear", "situation_tried", "offers_satisfaction"];
      for (const [k, v] of Object.entries(diagnosticProfile)) {
        if (ownerKeys.includes(k)) {
          ownerConstraints[k] = v;
        } else {
          personaRelevantDiagnostic[k] = v;
        }
      }
    }

    // Extract owner-specific onboarding facts vs persona-relevant ones
    const ownerOnboardingFacts: AnyRecord = {};
    const personaOnboardingFacts: AnyRecord = {};
    const ownerFactKeys = new Set([
      "non_negotiables", "root_fear", "situation_tried", "constraints",
      "tone_preference_hint", "preferred_tone", "time_available_hours_week",
      "time_available", "content_channels_priority", "revenue_goal_monthly",
      "offers_satisfaction", "business_stage", "business_maturity",
    ]);
    for (const [k, v] of Object.entries(onboardingFacts)) {
      if (ownerFactKeys.has(k)) {
        ownerOnboardingFacts[k] = v;
      } else {
        personaOnboardingFacts[k] = v;
      }
    }

    const userPrompt = `⚠️ REGLE CRITIQUE : Tu génères le persona du CLIENT IDEAL (la cible), PAS le profil du propriétaire du business.
Les informations ci-dessous distinguent clairement ce qui concerne le propriétaire (ses contraintes, ses préférences) et ce qui concerne sa cible (son audience, sa niche, ses offres). Ne mélange JAMAIS les deux.

═══════════════════════════════════════════════════
SECTION 1 — LE BUSINESS (niche, offres, positionnement)
Ces infos décrivent CE QUE FAIT le propriétaire et À QUI il s'adresse.
Utilise-les pour DÉDUIRE le profil du client idéal.
═══════════════════════════════════════════════════

Niche / activité : ${cleanString(businessProfile?.niche, 500) || "Non renseigné"}
Mission / persona existant : ${cleanString(businessProfile?.mission, 500) || "Non renseigné"}
Offres : ${JSON.stringify(businessProfile?.offers ?? "Non disponible", null, 2)}
Audience cible (onboarding) : ${cleanString(personaOnboardingFacts["target_audience_short"], 300) || "Non renseigné"}
Sujet principal : ${cleanString(personaOnboardingFacts["main_topic"], 200) || cleanString(personaOnboardingFacts["primary_activity"], 200) || "Non renseigné"}
Modèle économique : ${cleanString(personaOnboardingFacts["business_model"], 100) || "Non renseigné"}
Focus principal : ${cleanString(personaOnboardingFacts["primary_focus"], 100) || "Non renseigné"}

Diagnostic (infos sur la cible) :
${JSON.stringify(Object.keys(personaRelevantDiagnostic).length > 0 ? personaRelevantDiagnostic : "Non disponible", null, 2)}

═══════════════════════════════════════════════════
SECTION 2 — LE PROPRIETAIRE DU BUSINESS (ses contraintes perso)
⚠️ Ces infos concernent le PROPRIETAIRE, PAS son client idéal.
NE LES ATTRIBUE PAS au persona. Elles servent uniquement de contexte
pour comprendre les limites et le style du business.
═══════════════════════════════════════════════════

Maturité business : ${cleanString(businessProfile?.business_maturity, 100) || "Non renseigné"}
Ton préféré (du propriétaire) : ${cleanString(businessProfile?.tone_preference, 200) || "Non renseigné"}
Contraintes du propriétaire : ${JSON.stringify(Object.keys(ownerConstraints).length > 0 ? ownerConstraints : "Aucune", null, 2)}
Préférences du propriétaire (onboarding) : ${JSON.stringify(Object.keys(ownerOnboardingFacts).length > 0 ? ownerOnboardingFacts : "Aucune", null, 2)}
Résumé diagnostic : ${cleanString(businessProfile?.diagnostic_summary, 1000) || "Non disponible"}

═══════════════════════════════════════════════════
SECTION 3 — DONNÉES EXISTANTES (enrichissement)
═══════════════════════════════════════════════════

ANALYSE CONCURRENTIELLE :
${JSON.stringify(competitorAnalysis ?? "Non disponible", null, 2)}

PERSONA EXISTANT (à enrichir, pas à copier tel quel) :
${JSON.stringify(existingPersona?.persona_json ?? "Non disponible", null, 2)}

STRATEGIE EXISTANTE :
${JSON.stringify(
  {
    mission: (businessPlan?.plan_json as AnyRecord)?.mission ?? null,
    promise: (businessPlan?.plan_json as AnyRecord)?.promise ?? null,
    positioning: (businessPlan?.plan_json as AnyRecord)?.positioning ?? null,
    summary: (businessPlan?.plan_json as AnyRecord)?.summary ?? null,
  },
  null,
  2,
)}

EXTRAITS CONVERSATIONS COACH (contexte utilisateur) :
${coachContext || "Aucune conversation disponible."}

Génère le profil persona enrichi complet du CLIENT IDEAL en JSON.
Rappel : le persona décrit LA CIBLE (le client idéal), pas le propriétaire du business.`;

    const resp = await ai.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6,
      max_completion_tokens: 16000,
    }, { timeout: 110_000 });

    const raw = resp.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as AnyRecord;

    // Update business_profiles with enriched summaries
    const now = new Date().toISOString();
    const profilePatch: AnyRecord = { updated_at: now };

    if (parsed.persona_summary) {
      profilePatch.mission = cleanString(parsed.persona_summary, 10000);
    }
    // ✅ Niche formula: NEVER overwrite — the user's exact onboarding sentence is the source of truth.
    // The niche is set during onboarding and editable in Settings > Positionnement.

    const bpUpdateQ = supabase.from("business_profiles").update(profilePatch).eq("user_id", user.id);
    if (projectId) bpUpdateQ.eq("project_id", projectId);
    await bpUpdateQ;

    // Update personas table with enriched data
    if (parsed.persona_classic) {
      try {
        const admin = await import("@/lib/supabaseAdmin").then((m) => m.supabaseAdmin).catch(() => null);
        if (admin) {
          const personaPayload: AnyRecord = {
            user_id: user.id,
            ...(projectId ? { project_id: projectId } : {}),
            role: "client_ideal",
            name: cleanString(parsed.persona_classic?.title, 240) || null,
            pains: JSON.stringify(parsed.persona_classic?.pains ?? []),
            desires: JSON.stringify(parsed.persona_classic?.desires ?? []),
            objections: JSON.stringify(parsed.persona_classic?.objections ?? []),
            triggers: JSON.stringify(parsed.persona_classic?.triggers ?? []),
            exact_phrases: JSON.stringify(parsed.persona_classic?.exact_phrases ?? []),
            channels: JSON.stringify(parsed.persona_classic?.channels ?? []),
            persona_json: {
              ...parsed.persona_classic,
              detailed: parsed.persona_detailed,
              narrative_synthesis: parsed.narrative_synthesis,
              // New rich markdown fields from enhanced prompt
              persona_detailed_markdown: parsed.persona_detailed_markdown ?? null,
              competitor_insights_markdown: parsed.competitor_insights_markdown ?? null,
              narrative_synthesis_markdown: parsed.narrative_synthesis_markdown ?? null,
            },
            updated_at: now,
          };

          await admin.from("personas").upsert(personaPayload, { onConflict: "user_id,role" });
        }
      } catch (e) {
        console.error("Persona persistence error (non-blocking):", e);
      }
    }

    return NextResponse.json({
      ok: true,
      persona_summary: parsed.persona_summary ?? null,
      persona_detailed: parsed.persona_detailed ?? null,
      narrative_synthesis: parsed.narrative_synthesis ?? null,
      persona_classic: parsed.persona_classic ?? null,
      // New rich markdown fields
      persona_detailed_markdown: parsed.persona_detailed_markdown ?? null,
      competitor_insights_markdown: parsed.competitor_insights_markdown ?? null,
      narrative_synthesis_markdown: parsed.narrative_synthesis_markdown ?? null,
    });
  } catch (e: any) {
    const msg = (e?.message ?? "").toUpperCase();
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
