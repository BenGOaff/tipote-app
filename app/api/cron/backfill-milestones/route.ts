// app/api/cron/backfill-milestones/route.ts
//
// CRON ONE-SHOT — à run UNE SEULE FOIS après déploiement de la phase 1
// milestones (ROADMAP_RETENTION.md).
//
// CONTEXTE : Tipote a des mois d'historique business (quiz_leads,
// content_item published, transactions paid, etc.). Sans backfill,
// dès qu'un user actif déclenche un nouvel event (capture d'un lead,
// publication d'un post), l'engine débloque d'un coup tous les paliers
// déjà franchis (first_lead + leads_10 + leads_100 si l'user a 500
// leads) → 3 toasts + 3 emails déclenchés à tort = effet "outil qui
// débloque trop tard", vexant pour les gros users.
//
// CE QUE FAIT CE CRON : pour chaque user actif, lit countOutcomes
// (vérité historique depuis quiz_leads / content_item / transactions /
// quizzes), insère silencieusement dans user_milestones tous les
// jalons DÉJÀ acquis avec seen_at = now(). Pas de notif in-app, pas
// d'email. Juste un état correct en DB.
//
// IDEMPOTENT : la contrainte UNIQUE (user_id, milestone_key, project_id)
// sur user_milestones protège un rejeu accidentel. ON CONFLICT DO NOTHING.
//
// Auth : header X-Cron-Secret comme les autres crons Tipote.
//
// À lancer en prod (UNE SEULE FOIS) :
//   curl -fsS -H "X-Cron-Secret: $CRON_SECRET" \
//     https://app.tipote.com/api/cron/backfill-milestones \
//     > /tmp/backfill-milestones.log 2>&1
//
// Re-jouable : oui, idempotent. Si on ajoute des milestones au
// catalog plus tard, re-run = backfill juste les nouveaux jalons pour
// les users qui les ont déjà acquis.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import type { BusinessEventKind } from "@/lib/businessEvents";
import { countOutcomes, sumSalesForUser } from "@/lib/businessOutcomes";
import {
  MILESTONE_CATALOG,
  milestoneThreshold,
  type MilestoneDefinition,
} from "@/lib/milestones/catalog";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const provided = req.headers.get("x-cron-secret")?.trim() || "";
  if (provided.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
}

interface UserAndProject {
  user_id: string;
  project_id: string | null;
}

interface BackfillResult {
  userId: string;
  projectId: string | null;
  inserted: number;
  skipped: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // On itère sur l'union (user_id, project_id) des business_profiles.
  // Cas no-multi-projet : project_id = NULL (le user a un profil unique
  // sans project_id distinct). Cas multi-projet Elite : plusieurs lignes
  // par user.
  const { data: profiles, error: profErr } = await supabaseAdmin
    .from("business_profiles")
    .select("user_id, project_id");

  if (profErr) {
    return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 });
  }

  const targets = ((profiles ?? []) as UserAndProject[]).map((p) => ({
    user_id: p.user_id,
    project_id: p.project_id ?? null,
  }));

  // Cap de sécurité : si on a aussi des users SANS business_profile
  // (early adopters avant l'onboarding multi-projet), on les ajoute
  // depuis profiles.
  const { data: rawProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id");
  const profileUserIds = new Set(((rawProfiles ?? []) as Array<{ id: string }>).map((p) => p.id));
  const knownUserIds = new Set(targets.map((t) => t.user_id));
  for (const id of profileUserIds) {
    if (!knownUserIds.has(id)) {
      targets.push({ user_id: id, project_id: null });
    }
  }

  const results: BackfillResult[] = [];
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const target of targets) {
    try {
      const userResult = await backfillForUser(target);
      results.push(userResult);
      totalInserted += userResult.inserted;
      totalSkipped += userResult.skipped;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        userId: target.user_id,
        projectId: target.project_id,
        inserted: 0,
        skipped: 0,
        error: message,
      });
      console.error("[backfill-milestones] user failed", {
        userId: target.user_id,
        projectId: target.project_id,
        error: message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: targets.length,
    totalInserted,
    totalSkipped,
    results: results.slice(0, 100), // cap réponse — détail loggé dans pm2
  });
}

async function backfillForUser(target: UserAndProject): Promise<BackfillResult> {
  const { user_id: userId, project_id: projectId } = target;

  // Groupe les milestones par kind pour ne faire qu'UN countOutcomes
  // par kind (au lieu d'un par milestone).
  const byKind = new Map<BusinessEventKind, MilestoneDefinition[]>();
  for (const m of MILESTONE_CATALOG) {
    const arr = byKind.get(m.trigger.kind) ?? [];
    arr.push(m);
    byKind.set(m.trigger.kind, arr);
  }

  // Skip les milestones déjà débloqués (efficient si le cron est
  // re-run après un ajout de milestones au catalog).
  const allKeys = MILESTONE_CATALOG.map((m) => m.key);
  const { data: existingRows } = await supabaseAdmin
    .from("user_milestones")
    .select("milestone_key")
    .eq("user_id", userId)
    .in("milestone_key", allKeys);
  const existingKeys = new Set(
    ((existingRows ?? []) as Array<{ milestone_key: string }>).map((r) => r.milestone_key),
  );

  const rowsToInsert: Array<{
    user_id: string;
    project_id: string | null;
    milestone_key: string;
    payload: Record<string, unknown>;
    seen_at: string;
  }> = [];
  let skipped = 0;
  const now = new Date().toISOString();

  for (const [kind, milestones] of byKind.entries()) {
    const countTriggers = milestones.filter((m) => m.trigger.type === "count");
    const monetaryTriggers = milestones.filter(
      (m) => m.trigger.type === "monetary_threshold",
    );

    // Compteur d'events pour les triggers de type "count"
    let totalCount = 0;
    if (countTriggers.length > 0) {
      totalCount = await countOutcomes(userId, kind, { projectId });
    }

    // Somme cumulée pour les triggers monétaires (uniquement kind="sale")
    let totalAmountCents = 0;
    if (monetaryTriggers.length > 0) {
      const sums = await sumSalesForUser(userId, { projectId });
      totalAmountCents = sums.amountCents;
    }

    if (totalCount === 0 && totalAmountCents === 0) continue;

    // Triggers count, triés ASC pour break dès qu'on est sous le seuil.
    for (const milestone of countTriggers.sort(
      (a, b) => milestoneThreshold(a.trigger) - milestoneThreshold(b.trigger),
    )) {
      if (existingKeys.has(milestone.key)) {
        skipped += 1;
        continue;
      }
      if (milestone.trigger.type !== "count") continue;
      if (totalCount < milestone.trigger.threshold) break;
      rowsToInsert.push({
        user_id: userId,
        project_id: projectId,
        milestone_key: milestone.key,
        payload: {
          count: totalCount,
          emoji: milestone.emoji,
          title: milestone.title,
          backfilled: true,
        },
        seen_at: now,
      });
    }

    // Triggers monétaires, triés ASC sur thresholdCents.
    for (const milestone of monetaryTriggers.sort(
      (a, b) => milestoneThreshold(a.trigger) - milestoneThreshold(b.trigger),
    )) {
      if (existingKeys.has(milestone.key)) {
        skipped += 1;
        continue;
      }
      if (milestone.trigger.type !== "monetary_threshold") continue;
      if (totalAmountCents < milestone.trigger.thresholdCents) break;
      rowsToInsert.push({
        user_id: userId,
        project_id: projectId,
        milestone_key: milestone.key,
        payload: {
          amount_cents: totalAmountCents,
          emoji: milestone.emoji,
          title: milestone.title,
          backfilled: true,
        },
        seen_at: now,
      });
    }
  }

  if (rowsToInsert.length === 0) {
    return { userId, projectId, inserted: 0, skipped };
  }

  const { error } = await supabaseAdmin
    .from("user_milestones")
    .insert(rowsToInsert);

  if (error) {
    return {
      userId,
      projectId,
      inserted: 0,
      skipped,
      error: error.message,
    };
  }

  return { userId, projectId, inserted: rowsToInsert.length, skipped };
}
