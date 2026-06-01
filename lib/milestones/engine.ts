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
import { countOutcomes } from "@/lib/businessOutcomes";
import { createNotificationWithEmail } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  milestonesForKind,
  type MilestoneDefinition,
} from "@/lib/milestones/catalog";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tipote.com").replace(/\/$/, "");

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

  // Une seule lecture du compteur agrégé pour ce kind (chaque candidate
  // a le même trigger.kind par construction de milestonesForKind).
  // CRITIQUE : on lit la SOURCE HISTORIQUE (quiz_leads, content_item,
  // transactions, etc.) via countOutcomes — PAS business_events qui ne
  // couvre que depuis 2026-06-04 et ferait sortir "first_lead" chez
  // des users qui ont 500 leads. Cf. lib/businessOutcomes.ts.
  const totalCount = await countOutcomes(args.userId, args.eventKind, {
    projectId: args.projectId ?? null,
  });

  const unlocked: string[] = [];
  for (const milestone of toEvaluate) {
    if (totalCount < milestone.trigger.threshold) {
      // Les milestones sont triés par threshold ASC ; dès qu'on est
      // sous le seuil, les suivants sont aussi hors de portée.
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
