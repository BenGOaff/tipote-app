// app/api/persona/enrich/route.ts
// Regenerate enriched persona using onboarding data + competitor analysis + coach history
// Costs 1 credit. Updates business_profiles.mission and business_profiles.niche.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { buildEnhancedPersonaPrompt } from "@/lib/prompts/persona/system";

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
    const [
      { data: businessProfile },
      { data: onboardingFactsRows },
      { data: competitorAnalysis },
      { data: coachMessages },
      { data: existingPersona },
      { data: businessPlan },
    ] = await Promise.all([
      supabase.from("business_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("onboarding_facts").select("key,value").eq("user_id", user.id),
      supabase.from("competitor_analyses").select("summary,strengths,weaknesses,opportunities").eq("user_id", user.id).maybeSingle(),
      supabase.from("coach_messages").select("content,role").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("personas").select("persona_json").eq("user_id", user.id).eq("role", "client_ideal").maybeSingle(),
      supabase.from("business_plan").select("plan_json").eq("user_id", user.id).maybeSingle(),
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

    const userPrompt = `DONNEES UTILISATEUR

PROFIL BUSINESS :
${JSON.stringify(
  {
    niche: businessProfile?.niche ?? null,
    mission: businessProfile?.mission ?? null,
    offers: businessProfile?.offers ?? null,
    business_maturity: businessProfile?.business_maturity ?? null,
    tone_preference: businessProfile?.tone_preference ?? null,
    diagnostic_profile: businessProfile?.diagnostic_profile ?? null,
    diagnostic_summary: businessProfile?.diagnostic_summary ?? null,
  },
  null,
  2,
)}

ONBOARDING FACTS :
${JSON.stringify(onboardingFacts, null, 2)}

ANALYSE CONCURRENTIELLE :
${JSON.stringify(competitorAnalysis ?? "Non disponible", null, 2)}

PERSONA EXISTANT :
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

Genere le profil persona enrichi complet en JSON.`;

    const resp = await ai.chat.completions.create({
      model: "gpt-4.1",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 6000,
    });

    const raw = resp.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as AnyRecord;

    // Update business_profiles with enriched summaries
    const now = new Date().toISOString();
    const profilePatch: AnyRecord = { updated_at: now };

    if (parsed.persona_summary) {
      profilePatch.mission = cleanString(parsed.persona_summary, 10000);
    }
    if (parsed.niche_summary) {
      profilePatch.niche = cleanString(parsed.niche_summary, 5000);
    }

    await supabase.from("business_profiles").update(profilePatch).eq("user_id", user.id);

    // Update personas table with enriched data
    if (parsed.persona_classic) {
      try {
        const admin = await import("@/lib/supabaseAdmin").then((m) => m.supabaseAdmin).catch(() => null);
        if (admin) {
          const personaPayload: AnyRecord = {
            user_id: user.id,
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
      niche_summary: parsed.niche_summary ?? null,
      persona_detailed: parsed.persona_detailed ?? null,
      narrative_synthesis: parsed.narrative_synthesis ?? null,
      persona_classic: parsed.persona_classic ?? null,
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
