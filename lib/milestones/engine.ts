// lib/milestones/engine.ts
//
// Engine d'évaluation des milestones (phase 1 ROADMAP_RETENTION.md).
// Appelé en fire-and-forget après chaque INSERT réussi dans
// business_events (cf. lib/businessEvents.ts → logBusinessEvent post-hook).
//
// Garanties :
//   - Idempotent : la contrainte UNIQUE (user_id, milestone_key, project_id)
//     sur user_milestones empêche le double-débloquage.
//   - Non-bloquant : toute erreur loggée, jamais throw vers le caller.
//   - Faible coût par event : on ne ré-évalue QUE les milestones dont le
//     trigger.kind matche le kind de l'event qui vient d'arriver, et on
//     skip ceux déjà débloqués.

import type { BusinessEventKind } from "@/lib/businessEvents";
import { countOutcomes, sumSalesForUser } from "@/lib/businessOutcomes";
import { createNotificationWithEmail } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  milestonesForKind,
  type MilestoneDefinition,
} from "@/lib/milestones/catalog";

// Base URL des liens dans les EMAILS milestone. Tipote vit sur
// app.tipote.com. Drame Monique 8 juin 2026 : son mail "premier quiz
// complete" pointait sur quiz.tipote.com/quizzes (404) - c'est le
// domaine de TIQUIZ, pas Tipote. Cause : NEXT_PUBLIC_APP_URL mal
// configure en prod (ou herite d'un env partage). On betonne ici :
//   1. priorite a un env dedie MILESTONE_EMAIL_BASE_URL si fourni
//   2. sinon NEXT_PUBLIC_APP_URL
//   3. sinon default app.tipote.com
//   4. GARDE-FOU : si l'URL resolue pointe sur un domaine Tiquiz
//      (quiz.tipote.com) ou quoi que ce soit qui n'est pas l'app Tipote,
//      on FORCE app.tipote.com. Un mail Tipote ne doit JAMAIS lier vers
//      Tiquiz - ces routes n'existent pas la-bas.
function resolveMilestoneEmailBase(): string {
  const raw = (
    process.env.MILESTONE_EMAIL_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.tipote.com"
  ).trim().replace(/\/$/, "");
  try {
    const host = new URL(raw).host.toLowerCase();
    // Tout host qui n'est pas l'app Tipote -> on corrige. Couvre
    // quiz.tipote.com (Tiquiz), www.tipote.fr (sales), localhost mal
    // configure en prod, etc. En dev, app.tipote.com est inoffensif
    // (les emails ne partent pas vraiment).
    if (host !== "app.tipote.com") {
      return "https://app.tipote.com";
    }
    return raw;
  } catch {
    return "https://app.tipote.com";
  }
}

const APP_URL = resolveMilestoneEmailBase();

export interface EvaluateMilestonesArgs {
  userId: string;
  eventKind: BusinessEventKind;
  projectId?: string | null;
}

interface UserAuthRow {
  id: string;
  email: string | null;
  raw_user_meta_data: { name?: string } | null;
}

/**
 * Évalue tous les milestones potentiels pour ce (user, kind) et débloque
 * ceux qui sont franchis. Renvoie la liste des keys débloquées dans
 * cet appel (utile pour les logs / tests, le caller normal ignore).
 */
export async function evaluateMilestonesForUser(
  args: EvaluateMilestonesArgs,
): Promise<{ unlocked: string[]; ok: boolean }> {
  const candidates = milestonesForKind(args.eventKind);
  if (candidates.length === 0) {
    return { unlocked: [], ok: true };
  }

  // Skip les milestones déjà débloqués (par user + project) pour ne
  // pas spammer une notif identique. La contrainte UNIQUE en DB est
  // notre filet ; cette lecture évite juste un round-trip inutile.
  const candidateKeys = candidates.map((c) => c.key);
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("user_milestones")
    .select("milestone_key")
    .eq("user_id", args.userId)
    .in("milestone_key", candidateKeys);

  if (existingErr) {
    console.error("[milestones] read existing failed", existingErr.message);
    return { unlocked: [], ok: false };
  }
  const existingKeys = new Set(
    (existing ?? []).map((r) => r.milestone_key as string),
  );

  const toEvaluate = candidates.filter((c) => !existingKeys.has(c.key));
  if (toEvaluate.length === 0) {
    return { unlocked: [], ok: true };
  }

  // Sépare les triggers count vs monetary_threshold. Tous les triggers
  // ici partagent le même `kind` (par construction de milestonesForKind),
  // mais peuvent être de types différents (count = "ma 10e vente",
  // monetary_threshold = "1er 1k€ de CA").
  const countTriggers = toEvaluate.filter((m) => m.trigger.type === "count");
  const monetaryTriggers = toEvaluate.filter(
    (m) => m.trigger.type === "monetary_threshold",
  );

  // CRITIQUE : on lit la SOURCE HISTORIQUE (quiz_leads, content_item,
  // transactions, etc.) via countOutcomes — PAS business_events qui ne
  // couvre que depuis 2026-06-04. Cf. lib/businessOutcomes.ts + pitfalls
  // section AS ter.
  let totalCount = 0;
  if (countTriggers.length > 0) {
    totalCount = await countOutcomes(args.userId, args.eventKind, {
      projectId: args.projectId ?? null,
    });
  }

  // Pour les paliers monétaires, une lecture séparée de la somme.
  // Ne se produit que si kind = "sale" + au moins un trigger
  // monetary_threshold candidat (zéro coût sinon).
  let totalAmountCents = 0;
  if (monetaryTriggers.length > 0) {
    const sums = await sumSalesForUser(args.userId, {
      projectId: args.projectId ?? null,
    });
    totalAmountCents = sums.amountCents;
  }

  const unlocked: string[] = [];

  // Évaluation des triggers count, triés ASC par threshold (le filtre
  // milestonesForKind les a déjà triés au global).
  for (const milestone of countTriggers) {
    if (milestone.trigger.type !== "count") continue;
    if (totalCount < milestone.trigger.threshold) {
      // Les triggers count sont triés ASC ; on peut break.
      break;
    }
    const ok = await unlockMilestone({
      userId: args.userId,
      projectId: args.projectId ?? null,
      milestone,
      countAtUnlock: totalCount,
    });
    if (ok) unlocked.push(milestone.key);
  }

  // Évaluation des triggers monétaires (cumul CA).
  for (const milestone of monetaryTriggers) {
    if (milestone.trigger.type !== "monetary_threshold") continue;
    if (totalAmountCents < milestone.trigger.thresholdCents) continue;
    const ok = await unlockMilestone({
      userId: args.userId,
      projectId: args.projectId ?? null,
      milestone,
      countAtUnlock: totalAmountCents,
    });
    if (ok) unlocked.push(milestone.key);
  }

  return { unlocked, ok: true };
}

interface UnlockArgs {
  userId: string;
  projectId: string | null;
  milestone: MilestoneDefinition;
  countAtUnlock: number;
}

async function unlockMilestone(args: UnlockArgs): Promise<boolean> {
  const { userId, projectId, milestone, countAtUnlock } = args;

  // INSERT atomique. UNIQUE constraint en DB protège la course concurrente.
  const { data: insertedRow, error: insertErr } = await supabaseAdmin
    .from("user_milestones")
    .insert({
      user_id: userId,
      project_id: projectId,
      milestone_key: milestone.key,
      payload: {
        count: countAtUnlock,
        emoji: milestone.emoji,
        title: milestone.title,
      },
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    // 23505 = doublon, le milestone vient d'être débloqué par un autre
    // event concurrent → pas un échec.
    if (insertErr.code === "23505") {
      return false;
    }
    console.error("[milestones] unlock insert failed", {
      milestone: milestone.key,
      error: insertErr.message,
    });
    return false;
  }

  if (!insertedRow) {
    return false;
  }

  // Récupère l'email du user pour le mail de célébration. Si pas
  // d'email (cas test) on saute juste l'envoi, l'in-app reste OK.
  const userEmail = await fetchUserEmail(userId);

  const ctaUrl = absoluteUrl(milestone.ctaUrl);
  const inAppCtaUrl = milestone.ctaUrl ?? "/dashboard";

  await createNotificationWithEmail({
    userId,
    projectId,
    type: "milestone_unlocked",
    category: "milestone",
    title: milestone.title,
    body: milestone.body,
    icon: milestone.emoji,
    actionLabel: milestone.ctaLabel ?? "Voir mon dashboard",
    actionUrl: inAppCtaUrl,
    meta: {
      milestone_key: milestone.key,
      count: countAtUnlock,
    },
    emailDedupeKey: `milestone:${milestone.key}`,
    email: userEmail
      ? {
          to: userEmail.address,
          subject: milestone.emailSubject,
          greeting: userEmail.greeting,
          htmlBody: milestone.emailHtmlBody,
          ctaLabel: milestone.ctaLabel ?? "Voir mon dashboard",
          ctaUrl,
          preheader: milestone.body,
        }
      : null,
  });

  return true;
}

interface UserEmailInfo {
  address: string;
  greeting: string;
}

async function fetchUserEmail(userId: string): Promise<UserEmailInfo | null> {
  // auth.users n'est pas requêtable directement via le client postgres
  // sans certaines RLS bypass — on passe par admin.getUserById.
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    const address = data?.user?.email;
    if (error || !address) return null;
    const user = data.user;
    const name =
      (user.user_metadata?.first_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      "";
    const trimmedName = name.trim();
    const greeting = trimmedName.length > 0 ? `Salut ${trimmedName} !` : "Salut !";
    return { address, greeting };
  } catch (err) {
    console.error("[milestones] fetchUserEmail failed", err);
    return null;
  }
}

function absoluteUrl(path?: string | null): string {
  if (!path) return APP_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${APP_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
