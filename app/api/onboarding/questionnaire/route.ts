// app/api/onboarding/questionnaire/route.ts
// Saves all Typeform-style questionnaire answers to business_profiles
// and marks onboarding as completed.
//
// ✅ MULTI-PROJETS: scoped to active project (auto-creates default project if needed)
// ✅ FAIL-OPEN: graceful column-missing handling

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { ensureDefaultProject } from "@/lib/projects/ensureDefaultProject";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabaseAuth = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabaseAuth.auth.getSession();

    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Resolve active project (auto-create if needed for beta users)
    let projectId = await getActiveProjectId(supabaseAuth, userId);
    if (!projectId) {
      projectId = await ensureDefaultProject(userId);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // --- Map questionnaire answers to business_profiles columns ---
    const now = new Date().toISOString();

    // Core profile fields
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : null;
    const revenueGoalMonthly = typeof body.revenueGoalMonthly === "string" ? body.revenueGoalMonthly : null;
    const niche = buildNiche(body);
    const mission = typeof body.mission === "string" ? body.mission.trim() : null;
    const timeAvailable = typeof body.timeAvailable === "string" ? body.timeAvailable : null;
    const biggestBlocker = Array.isArray(body.biggestBlocker)
      ? body.biggestBlocker.join(", ")
      : typeof body.biggestBlocker === "string"
      ? body.biggestBlocker
      : null;
    const contentPreference = Array.isArray(body.contentPreference)
      ? body.contentPreference.join(", ")
      : typeof body.contentPreference === "string"
      ? body.contentPreference
      : null;
    const preferredTone = Array.isArray(body.preferredTone)
      ? body.preferredTone.join(", ")
      : typeof body.preferredTone === "string"
      ? body.preferredTone
      : null;

    // Business maturity
    const businessStatus = typeof body.businessStatus === "string" ? body.businessStatus : null;
    const hasOffers = businessStatus === "has_offers";
    const isAffiliate = businessStatus === "affiliation";
    const hasAlreadySold = typeof body.hasAlreadySold === "string" ? body.hasAlreadySold : null;
    const mainGoal = typeof body.primaryGoal === "string" ? body.primaryGoal : null;
    const mainGoals = Array.isArray(body.businessObjectives) ? body.businessObjectives : null;

    // Social links (platforms)
    const platforms = Array.isArray(body.platforms) ? body.platforms : [];
    const socialLinks = platforms.length > 0 ? platforms.join(", ") : null;

    // Audience
    const audienceEmail = typeof body.audienceEmail === "string" ? body.audienceEmail : null;
    const audienceSocial = typeof body.audienceSocial === "string" ? body.audienceSocial : null;

    // Offers
    const offersRaw = Array.isArray(body.offers) ? body.offers : null;

    // Extra diagnostic data stored as JSON
    const diagnosticAnswers: Record<string, unknown> = {
      // Revenue & goals
      revenueGoalMonthly,
      primaryGoal: body.primaryGoal ?? null,
      businessObjectives: body.businessObjectives ?? null,

      // Niche components
      nicheTarget: body.nicheTarget ?? null,
      nicheObjective: body.nicheObjective ?? null,
      nicheMechanism: body.nicheMechanism ?? null,
      nicheTimeframe: body.nicheTimeframe ?? null,

      // Ideal client
      clientProblem: body.clientProblem ?? null,
      clientPrevAttempts: body.clientPrevAttempts ?? null,
      clientFailures: body.clientFailures ?? null,
      clientFutureLife: body.clientFutureLife ?? null,

      // Business status
      businessStatus,
      hasAlreadySold,
      satisfiedWithOffers: body.satisfiedWithOffers ?? null,
      currentMonthlyRevenue: body.currentMonthlyRevenue ?? null,
      clientTestimonials: body.clientTestimonials ?? null,
      salesPageUrls: body.salesPageUrls ?? null,

      // Affiliation
      commissionRate: body.commissionRate ?? null,
      monthlyCommissions: body.monthlyCommissions ?? null,

      // Audience
      audienceEmail,
      audienceSocial,

      // Refusals
      refusals: body.refusals ?? null,

      // Platforms
      platforms,

      // Meta
      questionnaire_version: "v3",
      completed_at: now,
    };

    // Build the patch for business_profiles
    const patch: Record<string, unknown> = {
      onboarding_completed: true,
      onboarding_version: "v3",
      diagnostic_completed: true,
      updated_at: now,
    };

    if (firstName) patch.first_name = firstName;
    if (revenueGoalMonthly) patch.revenue_goal_monthly = revenueGoalMonthly;
    if (niche) {
      patch.niche = niche;
      // Use niche as mission if no explicit mission was given
      patch.mission = mission || niche;
    }
    if (timeAvailable) patch.time_available = timeAvailable;
    if (biggestBlocker) patch.biggest_blocker = biggestBlocker;
    if (contentPreference) patch.content_preference = contentPreference;
    if (preferredTone) patch.preferred_tone = preferredTone;
    if (mainGoal) patch.main_goal = mainGoal;
    if (mainGoals) patch.main_goals = mainGoals;
    if (socialLinks) patch.social_links = socialLinks;
    if (audienceEmail) patch.audience_email = audienceEmail;
    if (audienceSocial) patch.audience_social = audienceSocial;
    if (offersRaw) patch.offers = offersRaw;
    if (hasAlreadySold) patch.business_maturity = hasAlreadySold === "yes" ? "selling" : "pre-revenue";
    if (isAffiliate) patch.business_maturity = hasAlreadySold === "yes" ? "affiliate-active" : "affiliate-starting";

    patch.has_offers = hasOffers || isAffiliate;
    patch.diagnostic_answers = diagnosticAnswers;

    // Build a structured diagnostic summary for the strategy prompt
    const clientProblem = typeof body.clientProblem === "string" ? body.clientProblem.trim() : "";
    const clientFutureLife = typeof body.clientFutureLife === "string" ? body.clientFutureLife.trim() : "";
    const refusals = Array.isArray(body.refusals) ? (body.refusals as string[]).join(", ") : "";

    const summaryParts: string[] = [];
    if (niche) summaryParts.push(`Niche: ${niche}`);
    if (mainGoal) summaryParts.push(`Objectif principal: ${mainGoal}`);
    if (revenueGoalMonthly) summaryParts.push(`Objectif revenu: ${revenueGoalMonthly}`);
    if (clientProblem) summaryParts.push(`Problème client: ${clientProblem}`);
    if (clientFutureLife) summaryParts.push(`Résultat souhaité: ${clientFutureLife}`);
    if (biggestBlocker) summaryParts.push(`Blocage principal: ${biggestBlocker}`);
    if (refusals) summaryParts.push(`Refus: ${refusals}`);
    if (contentPreference) summaryParts.push(`Contenu préféré: ${contentPreference}`);
    if (preferredTone) summaryParts.push(`Ton: ${preferredTone}`);
    if (timeAvailable) summaryParts.push(`Temps disponible: ${timeAvailable}`);
    if (businessStatus) summaryParts.push(`Statut business: ${businessStatus === "has_offers" ? "a des offres" : businessStatus === "affiliation" ? "affiliation" : "débutant"}`);

    if (summaryParts.length > 0) {
      patch.diagnostic_summary = summaryParts.join(" | ");
    }

    // Upsert business_profiles
    let upsertOk = false;

    if (projectId) {
      // Try update first, then insert
      const { data: updRows, error: updErr } = await supabaseAdmin
        .from("business_profiles")
        .update(patch as any)
        .eq("user_id", userId)
        .eq("project_id", projectId)
        .select("id");

      if (!updErr && Array.isArray(updRows) && updRows.length > 0) {
        upsertOk = true;
      } else {
        // Insert new row
        const { error: insErr } = await supabaseAdmin
          .from("business_profiles")
          .insert({ user_id: userId, project_id: projectId, ...patch, created_at: now } as any);
        upsertOk = !insErr;
      }
    } else {
      // No project: update by user_id only
      const { data: updRows, error: updErr } = await supabaseAdmin
        .from("business_profiles")
        .update(patch as any)
        .eq("user_id", userId)
        .select("id");

      if (!updErr && Array.isArray(updRows) && updRows.length > 0) {
        upsertOk = true;
      } else {
        const { error: insErr } = await supabaseAdmin
          .from("business_profiles")
          .insert({ user_id: userId, ...patch, created_at: now } as any);
        upsertOk = !insErr;
      }
    }

    if (!upsertOk) {
      return NextResponse.json(
        { ok: false, error: "Impossible de sauvegarder tes réponses. Réessaie." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, projectId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** Build the niche string from fill-in components */
function buildNiche(body: Record<string, unknown>): string | null {
  const target = typeof body.nicheTarget === "string" ? body.nicheTarget.trim() : "";
  const objective = typeof body.nicheObjective === "string" ? body.nicheObjective.trim() : "";
  const mechanism = typeof body.nicheMechanism === "string" ? body.nicheMechanism.trim() : "";
  const timeframe = typeof body.nicheTimeframe === "string" ? body.nicheTimeframe.trim() : "";

  if (!target && !objective) return null;

  const parts = [`J'aide les ${target || "…"} à ${objective || "…"}`];
  if (mechanism) parts.push(`grâce à ${mechanism}`);
  if (timeframe) parts.push(`en ${timeframe}`);
  return parts.join(" ");
}
