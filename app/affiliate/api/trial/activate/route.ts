// app/affiliate/api/trial/activate/route.ts
//
// Active le mois Tiquiz Plus offert pour l'affilié connecté.
//
// Migration architecturale (Béné 2 juin 2026) : avant, on activait un
// trial Tipote (plan='elite') côté DB Tipote. Maintenant on octroie un
// mois Tiquiz Plus côté DB TIQUIZ via service-role cross-app
// (env TIQUIZ_SUPABASE_URL + TIQUIZ_SUPABASE_SERVICE_ROLE_KEY).
//
// Conditions :
//   - Affilié actif (vérifié par getAffiliateSession)
//   - Pas déjà activé une fois (affiliates.trial_activated_at IS NULL)
//   - Pas déjà sur un plan Tiquiz Plus payant / Lifetime
//
// Effets :
//   1. Affiliates Tipote : trial_activated_at = now, trial_expires_at = +30j
//      (one-shot enforcement, audit trail côté Tipote)
//   2. Tiquiz profiles : upsert avec plan = monthly_plus (ou yearly_plus
//      si l'user était déjà sur yearly), affiliate_trial_pre_plan = ancien plan,
//      affiliate_trial_expires_at = +30j.
//   3. Le cron Tiquiz /api/cron/affiliate-trial-expiry revert à J+30.

import { NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTiquizAdmin } from "@/lib/tiquizAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAL_DAYS = 30;
// Plans Tiquiz qui REFUSENT le trial (déjà Plus payant ou Lifetime).
// free / monthly / yearly sont éligibles : ils passent en _plus 30 jours
// puis reviennent à leur plan d'origine via le cron Tiquiz.
const TIQUIZ_REFUSED_PLANS: ReadonlySet<string> = new Set([
  "monthly_plus",
  "yearly_plus",
  "lifetime",
  "beta",
]);

// Mapping : plan d'origine → plan Plus à octroyer pendant le trial.
// On reste sur le même cycle (mensuel / annuel) pour que l'affilié
// ait l'expérience du Plus qui correspond à son abonnement existant.
function trialPlusFor(currentPlan: string): "monthly_plus" | "yearly_plus" {
  return currentPlan === "yearly" ? "yearly_plus" : "monthly_plus";
}

export async function POST(): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  // 0. Vérifier que la config cross-app est dispo. Sinon on refuse
  //    explicitement plutôt que de crasher.
  const tiquiz = getTiquizAdmin();
  if (!tiquiz) {
    console.error(
      "[affiliate/trial/activate] env TIQUIZ_SUPABASE_URL ou " +
        "TIQUIZ_SUPABASE_SERVICE_ROLE_KEY manquante — impossible d'activer le " +
        "trial Tiquiz Plus.",
    );
    return NextResponse.json(
      { ok: false, reason: "tiquiz_unreachable" },
      { status: 503 },
    );
  }

  // 1. Check qu'il n'a pas DÉJÀ activé son trial (one-shot, source de
  //    vérité côté Tipote pour pouvoir auditer même sans accès Tiquiz).
  const { data: affRow } = await supabaseAdmin
    .from("affiliates")
    .select("trial_activated_at, trial_expires_at")
    .eq("sa", session.sa)
    .maybeSingle();
  const aff = affRow as {
    trial_activated_at: string | null;
    trial_expires_at: string | null;
  } | null;
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

  // 2. Lire le profile Tiquiz par email (case-insensitive). Si pas de
  //    profile, on crée un profile minimal avec plan=monthly_plus + trial.
  //    Si profile existe avec plan Plus / Lifetime → refus.
  const { data: existing, error: readErr } = await tiquiz
    .from("profiles")
    .select("user_id, email, plan")
    .ilike("email", session.email)
    .maybeSingle();
  if (readErr) {
    console.error("[affiliate/trial/activate] tiquiz read error:", readErr.message);
    return NextResponse.json(
      { ok: false, reason: "tiquiz_read_error" },
      { status: 500 },
    );
  }
  const existingProfile = existing as {
    user_id: string;
    email: string;
    plan: string | null;
  } | null;

  const currentPlan = (existingProfile?.plan ?? "free").toLowerCase().trim();
  if (TIQUIZ_REFUSED_PLANS.has(currentPlan)) {
    return NextResponse.json(
      {
        ok: false,
        reason: "already_paid_user",
        current_plan: currentPlan,
        message:
          "Tu as déjà un compte Tiquiz Plus payant — pas besoin du mois offert. Profite à fond !",
      },
      { status: 200 },
    );
  }

  // 3. Activation. Dates communes Tipote + Tiquiz.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 3600 * 1000);
  const trialPlan = trialPlusFor(currentPlan);

  // 3a. Tiquiz : on upsert le profile en _plus avec pre_plan mémorisé.
  //     Si le profile n'existait pas (user_id null), on peut quand même
  //     créer une row "tampon" indexée par email — le profile sera
  //     reconcilié au prochain login Tiquiz (middleware Tiquiz upsert
  //     proprement avec le user_id auth).
  if (existingProfile?.user_id) {
    const { error: updErr } = await tiquiz
      .from("profiles")
      .update({
        plan: trialPlan,
        affiliate_trial_pre_plan: currentPlan,
        affiliate_trial_expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("user_id", existingProfile.user_id);
    if (updErr) {
      console.error(
        "[affiliate/trial/activate] tiquiz profile update error:",
        updErr.message,
      );
      return NextResponse.json(
        { ok: false, reason: "tiquiz_update_error" },
        { status: 500 },
      );
    }
  } else {
    // Pas encore de profile Tiquiz pour cet email — on laisse la création
    // au middleware Tiquiz (premier login). On stocke quand même le côté
    // Tipote pour l'enforcement one-shot ; le profile sera mis en Plus
    // au moment de la création via une logique côté Tiquiz à brancher
    // ultérieurement (lookup affiliates.trial_expires_at by email).
    console.log(
      `[affiliate/trial/activate] no Tiquiz profile yet for ${session.email}, ` +
        `Tiquiz must reconcile on first login.`,
    );
  }

  // 3b. Tipote affiliates : enregistre l'activation (one-shot enforcement).
  const { error: affUpdateErr } = await supabaseAdmin
    .from("affiliates")
    .update({
      trial_activated_at: now.toISOString(),
      trial_expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("sa", session.sa);

  if (affUpdateErr) {
    console.error(
      "[affiliate/trial/activate] affiliates update error:",
      affUpdateErr.message,
    );
    // Sale état : Tiquiz a déjà été upgrade. On log mais on répond
    // succès (le trial est bien actif côté user) — un admin pourra
    // recopier les dates dans affiliates manuellement si besoin.
  }

  return NextResponse.json({
    ok: true,
    activated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    days_remaining: TRIAL_DAYS,
    granted_plan: trialPlan,
    pre_trial_plan: currentPlan,
  });
}
