// GET /api/cron/coach-proactive
//
// Cron HEBDO (lundi 9h UTC ≈ 10h Paris) — phase 4 ROADMAP_RETENTION.md.
// Génère un brief stratégique personnalisé pour chaque user Pro / Elite
// / Beta via Claude Opus 4.8, l'envoie par email, et le persiste dans
// coach_messages avec summary_tags=["weekly_brief"] (consultable depuis
// l'écran /coach).
//
// Pourquoi Pro/Elite/Beta : c'est le différenciateur du palier Pro
// dans la roadmap rétention. Décision Béné : la version la plus puissante
// (Opus 4.8), pas d'économie sur la qualité délivrée aux users.
//
// Auth : header X-Cron-Secret (pattern matche /api/coach/notify
// existant, distinct du Bearer NOTIFICATIONS_INTERNAL_KEY utilisé par
// monthly-report / value-nudges).
//
// À installer dans la crontab :
//   0 9 * * 1 curl -fsS -H "X-Cron-Secret: $CRON_SECRET" \
//     https://app.tipote.com/api/cron/coach-proactive \
//     > /tmp/coach-proactive.log 2>&1
// (Lundi 9h UTC. Adaptable si Béné veut tester un autre créneau.)
//
// Best practices appliquées :
// - Modèle = claude-opus-4-8 (le plus puissant — décision Béné)
// - Prompt caching ephemeral sur le system prompt (~2k tokens) →
//   ~90% économie sur cette portion à partir du 2e user
// - Structured output JSON strict via output_config.format
// - Skip per-user errors (un user qui échoue n'arrête pas les autres)
// - Idempotence via coach_messages.summary_tags + (user_id, project_id,
//   ISO week) check : pas de double-brief la même semaine
// - Pas de toast/notif in-app pour les briefs où hasData=false (un
//   user 100% inactif reçoit un brief plus court "voici comment
//   reprendre" plutôt que rien — cf. esprit "on aide on aide on aide")

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { buildCoachContext } from "@/lib/coach/contextBuilder";
import { generateProactiveBrief } from "@/lib/coach/proactiveBriefer";
import { renderBriefAsEmailBody } from "@/lib/coach/render";
import { canSendEmailToday, sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";
const ELIGIBLE_PLANS = new Set(["pro", "elite", "beta"]);

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const provided = req.headers.get("x-cron-secret")?.trim() || "";
  if (provided.length !== CRON_SECRET.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(CRON_SECRET));
}

/** ISO week key : "2026-W23". Sert de dédup pour ne pas envoyer 2x le
 *  même brief la même semaine si le cron tourne 2x (manuel debug). */
function isoWeek(d: Date): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

interface UserResult {
  userId: string;
  projectId: string | null;
  sent: boolean;
  cacheHit?: boolean;
  reason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekKey = isoWeek(now);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com").replace(/\/$/, "");

  // 1. Récupère TOUS les users Pro / Elite / Beta. Source = profiles.plan.
  const { data: eligibleProfiles, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("id, plan")
    .in("plan", Array.from(ELIGIBLE_PLANS));
  if (profErr) {
    return NextResponse.json(
      { ok: false, error: profErr.message },
      { status: 500 },
    );
  }

  // 2. Pour chaque user, on itère sur ses (user_id, project_id) via
  //    business_profiles. Multi-projet Elite = un brief par projet.
  //    Si pas de business_profiles, on traite avec project_id=null.
  const userIds = new Set(((eligibleProfiles ?? []) as Array<{ id: string }>).map((p) => p.id));
  if (userIds.size === 0) {
    return NextResponse.json({ ok: true, processed: 0, sent: 0, skipped: 0, results: [] });
  }

  const { data: businessProfiles } = await supabaseAdmin
    .from("business_profiles")
    .select("user_id, project_id")
    .in("user_id", Array.from(userIds));

  const targets: Array<{ user_id: string; project_id: string | null }> = [];
  const seenPairs = new Set<string>();
  for (const bp of ((businessProfiles ?? []) as Array<{ user_id: string; project_id: string | null }>)) {
    const key = `${bp.user_id}:${bp.project_id ?? "null"}`;
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      targets.push({ user_id: bp.user_id, project_id: bp.project_id ?? null });
    }
  }
  // Users sans business_profile → traités quand même avec project_id=null
  for (const uid of userIds) {
    const key = `${uid}:null`;
    if (!seenPairs.has(key) && ![...seenPairs].some((k) => k.startsWith(`${uid}:`))) {
      seenPairs.add(key);
      targets.push({ user_id: uid, project_id: null });
    }
  }

  const results: UserResult[] = [];
  let sent = 0;
  let skipped = 0;

  for (const target of targets) {
    try {
      const result = await processUser(target.user_id, target.project_id, weekKey, appUrl, now);
      results.push(result);
      if (result.sent) sent += 1;
      else skipped += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[coach-proactive] user failed", {
        userId: target.user_id,
        projectId: target.project_id,
        error: message,
      });
      results.push({
        userId: target.user_id,
        projectId: target.project_id,
        sent: false,
        reason: `error:${message.slice(0, 100)}`,
      });
      skipped += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    weekKey,
    processed: targets.length,
    sent,
    skipped,
    results: results.slice(0, 100),
  });
}

async function processUser(
  userId: string,
  projectId: string | null,
  weekKey: string,
  appUrl: string,
  now: Date,
): Promise<UserResult> {
  const base = { userId, projectId };

  // ── Skip : déjà envoyé cette semaine pour ce (user, project) ──
  const { data: existing } = await supabaseAdmin
    .from("coach_messages")
    .select("id")
    .eq("user_id", userId)
    .contains("summary_tags", ["weekly_brief", weekKey])
    .limit(1);
  if (existing && existing.length > 0) {
    return { ...base, sent: false, reason: "dedup_week" };
  }

  // ── Skip : opt-out email_preferences ──
  const { data: prefs } = await supabaseAdmin
    .from("email_preferences")
    .select("weekly_digest")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefs && prefs.weekly_digest === false) {
    return { ...base, sent: false, reason: "opted_out" };
  }

  // ── Skip : rate limit global du jour ──
  if (!(await canSendEmailToday(userId, supabaseAdmin))) {
    return { ...base, sent: false, reason: "daily_cap" };
  }

  // ── Build context ──
  const { contextText, meta } = await buildCoachContext({
    userId,
    projectId,
    now,
  });

  // ── Skip : pas de data du tout (user qui s'est inscrit hier mais
  //         n'a rien activé). On ne lui envoie pas un brief vide. ──
  if (!meta.hasData) {
    return { ...base, sent: false, reason: "no_data" };
  }

  // ── Generate via Opus 4.8 ──
  const briefResult = await generateProactiveBrief({
    contextText,
    firstName: meta.firstName,
  });

  if (!briefResult.ok || !briefResult.brief) {
    return {
      ...base,
      sent: false,
      reason: briefResult.reason ?? "generation_failed",
      inputTokens: briefResult.usage?.inputTokens,
      outputTokens: briefResult.usage?.outputTokens,
    };
  }

  // ── Persiste dans coach_messages pour /coach + dédup futur ──
  await supabaseAdmin.from("coach_messages").insert({
    user_id: userId,
    project_id: projectId,
    role: "assistant",
    content: briefResult.brief.headline,
    summary_tags: ["weekly_brief", weekKey],
    facts: {
      brief: briefResult.brief,
      usage: briefResult.usage,
      generated_at: now.toISOString(),
    },
  });

  // ── Envoie l'email ──
  const { data: userRow } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userRow?.user?.email;
  if (!email) {
    return { ...base, sent: false, reason: "no_email_address" };
  }

  const { subject, htmlBody, preheader } = renderBriefAsEmailBody(
    briefResult.brief,
  );
  const greeting = meta.firstName ? `Salut ${meta.firstName} !` : "Salut !";

  try {
    await sendEmail({
      to: email,
      subject,
      greeting,
      body: htmlBody,
      ctaLabel: "Ouvrir le coach",
      ctaUrl: `${appUrl}/coach`,
      locale: meta.locale,
      preheader,
      category: "coach",
    });
  } catch (err) {
    console.error("[coach-proactive] sendEmail failed", err);
    return { ...base, sent: false, reason: "send_error" };
  }

  return {
    ...base,
    sent: true,
    cacheHit: briefResult.cacheHit,
    inputTokens: briefResult.usage?.inputTokens,
    outputTokens: briefResult.usage?.outputTokens,
  };
}
