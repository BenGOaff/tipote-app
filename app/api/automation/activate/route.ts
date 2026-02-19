// app/api/automation/activate/route.ts
// POST: activate auto-comments for a post
// - Verifies plan access (PRO/ELITE/BETA)
// - Consumes AI credits (0.25 per comment) from the standard user_credits pool
// - Updates content_item with auto-comment settings
// - Triggers before-comments execution immediately (fire-and-forget)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";
import {
  getUserPlan,
  planHasAutoComments,
  calculateCreditsNeeded,
  MAX_COMMENTS_BEFORE,
  MAX_COMMENTS_AFTER,
  CREDIT_PER_COMMENT,
} from "@/lib/automationCredits";
import { runAutoCommentBatch } from "@/lib/autoCommentEngine";

export const dynamic = "force-dynamic";

function isMissingColumn(msg?: string | null) {
  const m = (msg ?? "").toLowerCase();
  return m.includes("does not exist") || (m.includes("column") && m.includes("unknown"));
}

const EN_CONTENT_SEL = "id, user_id, type, content, status, channel, auto_comments_enabled, project_id";
const FR_CONTENT_SEL = "id, user_id, type, content:contenu, status:statut, channel:canal, auto_comments_enabled, project_id";

const ActivateSchema = z.object({
  content_id: z.string().uuid(),
  nb_comments_before: z.number().int().min(0).max(MAX_COMMENTS_BEFORE),
  nb_comments_after: z.number().int().min(0).max(MAX_COMMENTS_AFTER),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // 1. Check plan access
  let plan: string;
  try {
    plan = await getUserPlan(userId);
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Erreur lecture plan: " + (err instanceof Error ? err.message : "?") }, { status: 500 });
  }

  if (!planHasAutoComments(plan)) {
    return NextResponse.json(
      { ok: false, error: "PLAN_REQUIRED", message: "L'auto-commentaire nécessite un abonnement Pro ou Elite." },
      { status: 403 },
    );
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ActivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { content_id, nb_comments_before, nb_comments_after } = parsed.data;

  if (nb_comments_before === 0 && nb_comments_after === 0) {
    return NextResponse.json(
      { ok: false, error: "Au moins 1 commentaire avant ou après est requis." },
      { status: 400 },
    );
  }

  // 3. Verify content belongs to user (EN/FR schema compat)
  let content: any = null;
  const enRes = await supabaseAdmin
    .from("content_item")
    .select(EN_CONTENT_SEL)
    .eq("id", content_id)
    .maybeSingle();

  if (enRes.error && isMissingColumn(enRes.error.message)) {
    const frRes = await supabaseAdmin
      .from("content_item")
      .select(FR_CONTENT_SEL)
      .eq("id", content_id)
      .maybeSingle();
    content = frRes.data;
  } else {
    content = enRes.data;
  }

  if (!content) {
    return NextResponse.json({ ok: false, error: "Contenu introuvable." }, { status: 404 });
  }

  if (content.user_id !== userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  // If auto_comments already enabled, reset before re-activating (allows retesting)
  if (content.auto_comments_enabled) {
    await supabaseAdmin
      .from("content_item")
      .update({
        auto_comments_enabled: false,
        auto_comments_status: null,
        nb_comments_before: 0,
        nb_comments_after: 0,
        auto_comments_credits_consumed: 0,
      })
      .eq("id", content_id);
  }

  // 4. Calculate AI credits needed (0.25 per comment)
  const creditsNeeded = calculateCreditsNeeded(nb_comments_before, nb_comments_after);

  // 5. Check AI credits balance and consume
  let creditsRemaining: number;
  try {
    const balance = await ensureUserCredits(userId);
    if (balance.total_remaining < creditsNeeded) {
      return NextResponse.json(
        {
          ok: false,
          error: "NO_CREDITS",
          message: `Crédits insuffisants. ${creditsNeeded} crédits requis, ${balance.total_remaining} disponibles.`,
          credits_needed: creditsNeeded,
          credits_remaining: balance.total_remaining,
        },
        { status: 402 },
      );
    }

    // Consume credits — use Math.ceil to handle any integer constraint in the RPC
    const amountToConsume = Math.max(1, Math.ceil(creditsNeeded));
    const newBalance = await consumeCredits(userId, amountToConsume, {
      kind: "auto_comments",
      content_id,
      nb_before: nb_comments_before,
      nb_after: nb_comments_after,
      credit_per_comment: CREDIT_PER_COMMENT,
    });
    creditsRemaining = newBalance.total_remaining;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("NO_CREDITS")) {
      return NextResponse.json(
        { ok: false, error: "NO_CREDITS", message: "Crédits IA insuffisants." },
        { status: 402 },
      );
    }
    return NextResponse.json({ ok: false, error: "Erreur crédits: " + msg }, { status: 500 });
  }

  // 6. Update content_item with auto-comment settings
  const initialStatus = nb_comments_before > 0 ? "pending" : "before_done";
  const platform = content.channel || content.type || "";

  const { error: updateError } = await supabaseAdmin
    .from("content_item")
    .update({
      auto_comments_enabled: true,
      nb_comments_before,
      nb_comments_after,
      auto_comments_credits_consumed: creditsNeeded,
      auto_comments_status: initialStatus,
    })
    .eq("id", content_id);

  if (updateError) {
    console.error("[activate] DB update error:", updateError.message);
  }

  // 7. Trigger auto-comment execution directly (fire-and-forget)
  // Get social connection for executing comments
  if (nb_comments_before > 0) {
    triggerBeforeExecution({
      content_id,
      user_id: userId,
      project_id: content.project_id,
      platform,
      post_text: content.content || "",
      nb_comments: nb_comments_before,
    });
  }

  return NextResponse.json({
    ok: true,
    credits_consumed: creditsNeeded,
    credits_remaining: creditsRemaining,
    auto_comments: {
      enabled: true,
      nb_before: nb_comments_before,
      nb_after: nb_comments_after,
      status: initialStatus,
    },
  });
}

// ─── Fire-and-forget before-comments execution ──────────────────────────────

function triggerBeforeExecution(opts: {
  content_id: string;
  user_id: string;
  project_id?: string;
  platform: string;
  post_text: string;
  nb_comments: number;
}) {
  void (async () => {
    try {
      // Try with project_id first, then fallback without (connection may have no project_id set)
      let connQuery = supabaseAdmin
        .from("social_connections")
        .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
        .eq("user_id", opts.user_id)
        .eq("platform", opts.platform);
      if (opts.project_id) connQuery = connQuery.eq("project_id", opts.project_id);

      let { data: conn } = await connQuery.maybeSingle();

      // Fallback: try without project_id filter if not found
      if (!conn?.access_token_encrypted && opts.project_id) {
        const { data: connFallback } = await supabaseAdmin
          .from("social_connections")
          .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
          .eq("user_id", opts.user_id)
          .eq("platform", opts.platform)
          .maybeSingle();
        conn = connFallback;
      }
      if (!conn?.access_token_encrypted) {
        const errMsg = `Aucune connexion sociale trouvée pour ${opts.platform}. Connectez votre compte dans Paramètres > Connexions.`;
        console.error("[activate]", errMsg);
        await supabaseAdmin.from("auto_comment_logs").insert({
          user_id: opts.user_id,
          post_tipote_id: opts.content_id,
          platform: opts.platform,
          comment_text: "",
          comment_type: "before",
          status: "failed",
          error_message: errMsg,
        }).then(() => {}, () => {});
        await supabaseAdmin.from("content_item").update({ auto_comments_status: "before_done" }).eq("id", opts.content_id);
        return;
      }

      let accessToken: string;

      // Check token expiry and refresh if needed (5-minute buffer)
      const REFRESH_BUFFER_MS = 5 * 60 * 1000;
      const isExpired = conn.token_expires_at && new Date(conn.token_expires_at) < new Date(Date.now() + REFRESH_BUFFER_MS);
      if (isExpired) {
        const refreshResult = await refreshSocialToken(conn.id, opts.platform, conn.refresh_token_encrypted ?? null);
        if (!refreshResult.ok || !refreshResult.accessToken) {
          const errMsg = `Token ${opts.platform} expiré et renouvellement échoué: ${refreshResult.error ?? "inconnu"}. Reconnectez votre compte.`;
          console.error("[activate]", errMsg);
          await supabaseAdmin.from("auto_comment_logs").insert({
            user_id: opts.user_id,
            post_tipote_id: opts.content_id,
            platform: opts.platform,
            comment_text: "",
            comment_type: "before",
            status: "failed",
            error_message: errMsg,
          }).then(() => {}, () => {});
          await supabaseAdmin.from("content_item").update({ auto_comments_status: "before_done" }).eq("id", opts.content_id);
          return;
        }
        accessToken = refreshResult.accessToken;
      } else {
        try {
          accessToken = decrypt(conn.access_token_encrypted);
        } catch {
          const errMsg = `Impossible de déchiffrer le token ${opts.platform}. Reconnectez votre compte.`;
          await supabaseAdmin.from("auto_comment_logs").insert({
            user_id: opts.user_id,
            post_tipote_id: opts.content_id,
            platform: opts.platform,
            comment_text: "",
            comment_type: "before",
            status: "failed",
            error_message: errMsg,
          }).then(() => {}, () => {});
          await supabaseAdmin.from("content_item").update({ auto_comments_status: "before_done" }).eq("id", opts.content_id);
          return;
        }
      }

      const { data: profile } = await supabaseAdmin
        .from("business_profiles")
        .select("auto_comment_style_ton, auto_comment_langage, brand_tone_of_voice, niche")
        .eq("user_id", opts.user_id)
        .maybeSingle();

      await runAutoCommentBatch({
        supabaseAdmin,
        contentId: opts.content_id,
        userId: opts.user_id,
        platform: opts.platform,
        accessToken,
        platformUserId: conn.platform_user_id,
        postText: opts.post_text,
        commentType: "before",
        nbComments: opts.nb_comments,
        styleTon: profile?.auto_comment_style_ton || "professionnel",
        niche: profile?.niche || "",
        brandTone: profile?.brand_tone_of_voice || "",
        langage: profile?.auto_comment_langage || {},
      });
    } catch (err) {
      console.error("[activate] triggerBeforeExecution error:", err);
      try {
        await supabaseAdmin.from("content_item").update({ auto_comments_status: "before_done" }).eq("id", opts.content_id);
      } catch { /* ignore */ }
    }
  })();
}
