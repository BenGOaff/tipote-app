// app/api/persona/enrich/route.ts
// Regenerate enriched persona using onboarding data + competitor analysis + coach history
// Costs 1 credit. Updates business_profiles.mission and business_profiles.niche.
// Returns SSE stream with heartbeats to prevent proxy/hosting 504 timeouts.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { buildEnhancedPersonaPrompt } from "@/lib/prompts/persona/system";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AnyRecord = Record<string, any>;

function cleanString(v: unknown, maxLen = 240): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export async function POST() {
  // ── Pre-validate synchronously before starting the stream ──────────
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  let userId: string;
  let projectId: string | null;

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
    projectId = await getActiveProjectId(supabase, userId);

    if (!openai) {
      return NextResponse.json(
        { ok: false, error: "AI client not configured" },
        { status: 500 },
      );
    }

    // Charge 1 credit
    await ensureUserCredits(userId);
    const creditsResult = await consumeCredits(userId, 1, { feature: "persona_enrich" });
    if (creditsResult && typeof creditsResult === "object") {
      const ok = (creditsResult as any).success;
      const err = cleanString((creditsResult as any).error, 120).toUpperCase();
      if (ok === false && err.includes("NO_CREDITS")) {
        return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
      }
    }
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

  // ── Start SSE stream — heartbeats keep the connection alive ────────
  const ai = openai!;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendSSE(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      // Send heartbeat every 5 seconds to prevent proxy timeout
      const heartbeat = setInterval(() => {
        try {
          sendSSE("heartbeat", { status: "enriching" });
        } catch { /* stream closed */ }
      }, 5000);

      try {
        sendSSE("progress", { step: "Collecte des données..." });

        // Gather all available data in parallel
        const bpQ = supabase.from("business_profiles").select("*").eq("user_id", userId);
        if (projectId) bpQ.eq("project_id", projectId);

        const ofQ = supabase.from("onboarding_facts").select("key,value").eq("user_id", userId);
        if (projectId) ofQ.eq("project_id", projectId);

        const caQ = supabase.from("competitor_analyses").select("summary,strengths,weaknesses,opportunities").eq("user_id", userId);
        if (projectId) caQ.eq("project_id", projectId);

        const cmQ = supabase.from("coach_messages").select("content,role").eq("user_id", userId);
        if (projectId) cmQ.eq("project_id", projectId);

        const pQ = supabase.from("personas").select("persona_json").eq("user_id", userId).eq("role", "client_ideal");
        if (projectId) pQ.eq("project_id", projectId);

        const plQ = supabase.from("business_plan").select("plan_json").eq("user_id", userId);
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

        // ── Separate owner data from persona-relevant data ──
        // WHITELIST approach: only explicitly persona-relevant keys pass through.
        // Everything else defaults to OWNER to prevent data leakage into the persona.
        const diagnosticProfile = (businessProfile?.diagnostic_profile ?? null) as AnyRecord | null;

        const ownerConstraints: AnyRecord = {};
        const personaRelevantDiagnostic: AnyRecord = {};
        if (diagnosticProfile && typeof diagnosticProfile === "object") {
          // Only these keys describe the TARGET MARKET / AUDIENCE (not the owner)
          const personaDiagnosticKeys = new Set([
            "target_audience", "target_market", "ideal_client", "client_profile",
            "audience_demographics", "audience_pain_points", "market_segment",
            "customer_needs", "customer_desires", "customer_objections",
          ]);
          for (const [k, v] of Object.entries(diagnosticProfile)) {
            if (personaDiagnosticKeys.has(k)) {
              personaRelevantDiagnostic[k] = v;
            } else {
              ownerConstraints[k] = v;
            }
          }
        }

        // ── Onboarding facts: WHITELIST of persona-relevant keys ──
        // Only keys that describe the BUSINESS CONTEXT (niche, audience, topic)
        // are used to DEDUCE the persona. Everything else is owner data.
        const ownerOnboardingFacts: AnyRecord = {};
        const personaOnboardingFacts: AnyRecord = {};
        const personaFactKeys = new Set([
          // Audience / target
          "target_audience_short", "target_audience", "ideal_client",
          "real_persona_detail",
          // Business context (used to DEDUCE the persona, not persona traits)
          "main_topic", "primary_activity", "business_model",
          "primary_focus", "niche", "market_segment",
        ]);
        for (const [k, v] of Object.entries(onboardingFacts)) {
          if (personaFactKeys.has(k)) {
            personaOnboardingFacts[k] = v;
          } else {
            ownerOnboardingFacts[k] = v;
          }
        }

        const userPrompt = `⚠️ REGLE CRITIQUE : Tu génères le persona du CLIENT IDEAL (la cible), PAS le profil du propriétaire du business.
Les informations ci-dessous distinguent clairement ce qui concerne le propriétaire (ses contraintes, ses préférences) et ce qui concerne sa cible (son audience, sa niche, ses offres). Ne mélange JAMAIS les deux.

═══════════════════════════════════════════════════
SECTION 1 — LE BUSINESS (niche, offres, positionnement)
Ces infos décrivent CE QUE FAIT le propriétaire et À QUI il s'adresse.
Utilise-les UNIQUEMENT pour DÉDUIRE le profil du client idéal.
═══════════════════════════════════════════════════

Niche / activité : ${cleanString(businessProfile?.niche, 500) || "Non renseigné"}
Mission / persona existant : ${cleanString(businessProfile?.mission, 500) || "Non renseigné"}
Offres : ${JSON.stringify(businessProfile?.offers ?? "Non disponible", null, 2)}
Audience cible (onboarding) : ${cleanString(personaOnboardingFacts["target_audience_short"] ?? personaOnboardingFacts["target_audience"], 300) || "Non renseigné"}
Sujet principal : ${cleanString(personaOnboardingFacts["main_topic"], 200) || cleanString(personaOnboardingFacts["primary_activity"], 200) || "Non renseigné"}
Modèle économique : ${cleanString(personaOnboardingFacts["business_model"], 100) || "Non renseigné"}
Focus principal : ${cleanString(personaOnboardingFacts["primary_focus"], 100) || "Non renseigné"}
${Object.keys(personaRelevantDiagnostic).length > 0 ? `\nDonnées sur la cible (diagnostic) :\n${JSON.stringify(personaRelevantDiagnostic, null, 2)}` : ""}

═══════════════════════════════════════════════════
SECTION 2 — LE PROPRIETAIRE DU BUSINESS (⛔ NE PAS UTILISER DANS LE PERSONA)
Ces infos concernent le PROPRIETAIRE UNIQUEMENT.
Elles sont fournies pour contexte business mais NE DOIVENT JAMAIS
apparaître dans le persona, même reformulées.
Exemples : "contenus courts", "peu de temps", "coaching pragmatique",
"LinkedIn", "format lisible" = préférences du PROPRIETAIRE, pas de la cible.
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

        sendSSE("progress", { step: "Génération IA du persona enrichi..." });

        const resp = await ai.chat.completions.create({
          model: OPENAI_MODEL,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_completion_tokens: 16000,
        });

        const choice = resp.choices?.[0];
        const raw = choice?.message?.content ?? "{}";

        // Detect truncated output (model hit token limit before finishing JSON)
        if (choice?.finish_reason === "length") {
          console.error("[persona/enrich] Output truncated (finish_reason=length). Tokens used:",
            resp.usage?.completion_tokens, "/", 16000);
          sendSSE("error", {
            ok: false,
            error: "La génération a été tronquée (réponse trop longue). Réessayez.",
          });
          return;
        }

        let parsed: AnyRecord;
        try {
          parsed = JSON.parse(raw) as AnyRecord;
        } catch (parseErr) {
          console.error("[persona/enrich] JSON parse failed. Raw length:", raw.length,
            "finish_reason:", choice?.finish_reason);
          sendSSE("error", {
            ok: false,
            error: "L'IA a retourné un JSON invalide. Réessayez.",
          });
          return;
        }

        sendSSE("progress", { step: "Sauvegarde du persona..." });

        // Update business_profiles with enriched summaries
        const now = new Date().toISOString();
        const profilePatch: AnyRecord = { updated_at: now };

        if (parsed.persona_summary) {
          profilePatch.mission = cleanString(parsed.persona_summary, 10000);
        }
        // Niche formula: NEVER overwrite — the user's exact onboarding sentence is the source of truth.

        const bpUpdateQ = supabase.from("business_profiles").update(profilePatch).eq("user_id", userId);
        if (projectId) bpUpdateQ.eq("project_id", projectId);
        await bpUpdateQ;

        // Update personas table with enriched data
        if (parsed.persona_classic) {
          try {
            const admin = await import("@/lib/supabaseAdmin").then((m) => m.supabaseAdmin).catch(() => null);
            if (admin) {
              const personaPayload: AnyRecord = {
                user_id: userId,
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

        sendSSE("result", {
          ok: true,
          persona_summary: parsed.persona_summary ?? null,
          persona_detailed: parsed.persona_detailed ?? null,
          narrative_synthesis: parsed.narrative_synthesis ?? null,
          persona_classic: parsed.persona_classic ?? null,
          persona_detailed_markdown: parsed.persona_detailed_markdown ?? null,
          competitor_insights_markdown: parsed.competitor_insights_markdown ?? null,
          narrative_synthesis_markdown: parsed.narrative_synthesis_markdown ?? null,
        });
      } catch (e: any) {
        const msg = (e?.message ?? "").toUpperCase();
        if (msg.includes("NO_CREDITS")) {
          sendSSE("error", { ok: false, error: "NO_CREDITS" });
        } else {
          console.error("[persona/enrich] SSE stream error:", e);
          sendSSE("error", { ok: false, error: e instanceof Error ? e.message : "Unknown error" });
        }
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Prevent nginx proxy buffering
    },
  });
}
