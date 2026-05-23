// app/affiliate/api/trial/activate/route.ts
//
// Active le trial Tipote 1 mois pour l'affilié connecté.
// Conditions :
//   - Affilié actif (vérifié par getAffiliateSession)
//   - Pas déjà activé (trial_activated_at IS NULL)
//   - Pas déjà sur un plan payant Tipote (free/null OK, autres refusés)
//
// Effets :
//   1. Set affiliates.trial_activated_at = now()
//   2. Set affiliates.trial_expires_at = now() + 30 jours
//   3. Upsert profile Tipote pour cet email avec plan='elite',
//      plan_source='affiliate_trial', trial_expires_at = même date
//   4. Log dans plan_change_log

import { NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_DAYS = 30;
const LIFETIME_OR_PAID_PLANS: ReadonlySet<string> = new Set([
  "beta",
  "basic",
  "pro",
  "elite",
]);

export async function POST(): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  // 1. Check qu'il n'a pas DÉJÀ activé son trial (one-shot)
  const { data: affRow } = await supabaseAdmin
    .from("affiliates")
    .select("trial_activated_at, trial_expires_at")
    .eq("sa", session.sa)
    .maybeSingle();
  const aff = affRow as { trial_activated_at: string | null; trial_expires_at: string | null } | null;
  if (aff?.trial_activated_at) {
    const expired = aff.trial_expires_at && new Date(aff.trial_expires_at) < new Date();
    return NextResponse.json(
      {
        ok: false,
        reason: "already_activated",
        activated_at: aff.trial_activated_at,
        expires_at: aff.trial_expires_at,
        expired: !!expired,
      },
      { status: 200 },
    );
  }

  // 2. Check si l'affilié a déjà un compte Tipote payant — si oui,
  //    refus (pas la peine d'écraser un client payant)
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("id, email, plan, plan_source")
    .ilike("email", session.email)
    .maybeSingle();
  const existingProfile = profileRow as {
    id: string;
    email: string;
    plan: string | null;
    plan_source: string | null;
  } | null;

  const currentPlan = (existingProfile?.plan ?? "free").toLowerCase().trim();
  if (LIFETIME_OR_PAID_PLANS.has(currentPlan)) {
    return NextResponse.json(
      {
        ok: false,
        reason: "already_paid_user",
        current_plan: currentPlan,
        message:
          "Tu as déjà un compte Tipote payant — tu n'as pas besoin du trial. Profite à fond !",
      },
      { status: 200 },
    );
  }

  // 3. Activation. On set les deux dates en même temps pour cohérence.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 3600 * 1000);

  const { error: affUpdateErr } = await supabaseAdmin
    .from("affiliates")
    .update({
      trial_activated_at: now.toISOString(),
      trial_expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("sa", session.sa);

  if (affUpdateErr) {
    console.error("[affiliate/trial/activate] affiliates update error:", affUpdateErr.message);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  // 4. Upsert le profile Tipote (création si pas encore existant)
  if (existingProfile?.id) {
    // Profile existe (probablement plan='free') → on update vers elite
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: "elite",
        plan_source: "affiliate_trial",
        trial_expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", existingProfile.id);
    if (profileErr) {
      console.error("[affiliate/trial/activate] profile update error:", profileErr.message);
      // On laisse la row affiliates trial activée pour audit, l'admin
      // peut corriger manuellement le profile si besoin.
    } else {
      // Log le changement pour audit (pattern utilisé partout dans Tipote)
      try {
        await supabaseAdmin.from("plan_change_log").insert({
          target_user_id: existingProfile.id,
          target_email: session.email,
          old_plan: currentPlan,
          new_plan: "elite",
          reason: `affiliate_trial:activated:sa=${session.sa}`,
        });
      } catch {
        // best-effort
      }
    }
  } else {
    // Pas encore de profile Tipote pour cet email → on en crée un
    // léger avec juste les champs nécessaires. L'auth.users côté
    // Supabase a déjà été créé via le flow signup affilié.
    // Note : on n'a pas le user_id Supabase auth sous la main ici.
    // Pour pas dupliquer la logique, on laisse profile vide et le user
    // sera créé proprement quand il visitera app.tipote.com (le
    // middleware Tipote upsert un profile minimal au premier accès).
    // On stocke quand même trial_expires_at côté affiliates pour
    // pouvoir rebrancher à ce moment-là.
    console.log(
      `[affiliate/trial/activate] no Tipote profile yet for ${session.email}, ` +
        `will be created on first visit to app.tipote.com`,
    );
  }

  return NextResponse.json({
    ok: true,
    activated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    days_remaining: TRIAL_DAYS,
  });
}
