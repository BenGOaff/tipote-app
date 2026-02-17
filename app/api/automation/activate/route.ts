// app/api/automation/activate/route.ts
// POST: activate auto-comments for a post
// - Verifies plan access (PRO/ELITE/BETA)
// - Consumes AI credits (0.25 per comment) from the standard user_credits pool
// - Updates content_item with auto-comment settings
// - Triggers auto-comment execution directly (+ n8n webhook as fallback)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import { decrypt } from "@/lib/crypto";
import {
  getUserPlan,
  planHasAutoComments,
  calculateCreditsNeeded,
  MAX_COMMENTS_BEFORE,
  MAX_COMMENTS_AFTER,
  CREDIT_PER_COMMENT,
} from "@/lib/automationCredits";

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

  if (content.auto_comments_enabled) {
    return NextResponse.json(
      { ok: false, error: "L'auto-commentaire est déjà activé pour ce post." },
      { status: 409 },
    );
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
    triggerExecution({
      content_id,
      user_id: userId,
      project_id: content.project_id,
      platform,
      post_text: content.content || "",
      comment_type: "before",
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

// ─── Trigger auto-comment execution asynchronously ───────────────────────────

function triggerExecution(opts: {
  content_id: string;
  user_id: string;
  project_id?: string;
  platform: string;
  post_text: string;
  comment_type: "before" | "after";
  nb_comments: number;
}) {
  // Run in background — don't await
  void (async () => {
    try {
      // Get social connection
      let connQuery = supabaseAdmin
        .from("social_connections")
        .select("platform_user_id, access_token_encrypted")
        .eq("user_id", opts.user_id)
        .eq("platform", opts.platform);

      if (opts.project_id) {
        connQuery = connQuery.eq("project_id", opts.project_id);
      }

      const { data: conn } = await connQuery.maybeSingle();
      if (!conn?.access_token_encrypted) {
        console.error("[activate] No social connection for", opts.platform);
        return;
      }

      let accessToken: string;
      try {
        accessToken = decrypt(conn.access_token_encrypted);
      } catch {
        console.error("[activate] Failed to decrypt token");
        return;
      }

      // Get user's style preferences
      const { data: profile } = await supabaseAdmin
        .from("business_profiles")
        .select("auto_comment_style_ton, auto_comment_langage, auto_comment_objectifs, brand_tone_of_voice, niche")
        .eq("user_id", opts.user_id)
        .maybeSingle();

      // Call the execute endpoint
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000";
      const executeUrl = `${appUrl}/api/n8n/auto-comments/execute`;

      await fetch(executeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": process.env.INTERNAL_API_KEY || process.env.N8N_SHARED_SECRET || "",
        },
        body: JSON.stringify({
          content_id: opts.content_id,
          user_id: opts.user_id,
          platform: opts.platform,
          platform_user_id: conn.platform_user_id,
          access_token: accessToken,
          post_text: opts.post_text,
          comment_type: opts.comment_type,
          nb_comments: opts.nb_comments,
          style_ton: profile?.auto_comment_style_ton || "professionnel",
          niche: profile?.niche || "",
          brand_tone: profile?.brand_tone_of_voice || "",
          langage: profile?.auto_comment_langage || {},
        }),
      });
    } catch (err) {
      console.error("[activate] triggerExecution error:", err);
    }
  })();
}
