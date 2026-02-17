// app/api/automation/activate/route.ts
// POST: activate auto-comments for a post
// - Verifies plan access (PRO/ELITE/BETA)
// - Consumes AI credits (0.25 per comment) from the standard user_credits pool
// - Updates content_item with auto-comment settings
// - Triggers n8n webhook for auto-comment workflow

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
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

const EN_CONTENT_SEL = "id, user_id, type, status, channel, auto_comments_enabled";
const FR_CONTENT_SEL = "id, user_id, type, status:statut, channel:canal, auto_comments_enabled";

const ActivateSchema = z.object({
  content_id: z.string().uuid(),
  nb_comments_before: z.number().int().min(0).max(MAX_COMMENTS_BEFORE),
  nb_comments_after: z.number().int().min(0).max(MAX_COMMENTS_AFTER),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 1. Check plan access
    const plan = await getUserPlan(userId);
    if (!planHasAutoComments(plan)) {
      return NextResponse.json(
        {
          ok: false,
          error: "PLAN_REQUIRED",
          message: "L'auto-commentaire nécessite un abonnement Pro ou Elite.",
        },
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

    // 5. Check AI credits balance
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

    // 6. Consume AI credits upfront
    const newBalance = await consumeCredits(userId, creditsNeeded, {
      kind: "auto_comments",
      content_id,
      nb_before: nb_comments_before,
      nb_after: nb_comments_after,
      credit_per_comment: CREDIT_PER_COMMENT,
    });

    // 7. Update content_item with auto-comment settings
    // If no before-comments needed, skip straight to "before_done" (waiting for publish)
    const initialStatus = nb_comments_before > 0 ? "pending" : "before_done";

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
      console.error("[activate auto-comments] DB update error:", updateError);
    }

    // 8. Notify n8n webhook (fire-and-forget)
    const n8nWebhookUrl = process.env.N8N_AUTO_COMMENTS_WEBHOOK_URL;
    if (n8nWebhookUrl) {
      void fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-Secret": process.env.N8N_SHARED_SECRET || "",
        },
        body: JSON.stringify({
          event: "auto_comments_activated",
          content_id,
          user_id: userId,
          platform: content.channel || content.type,
          nb_comments_before,
          nb_comments_after,
        }),
      }).catch((err) => {
        console.error("[activate auto-comments] n8n webhook error:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      credits_consumed: creditsNeeded,
      credits_remaining: newBalance.total_remaining,
      auto_comments: {
        enabled: true,
        nb_before: nb_comments_before,
        nb_after: nb_comments_after,
        status: initialStatus,
      },
    });
  } catch (err) {
    console.error("[POST /api/automation/activate] error:", err);

    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("NO_CREDITS")) {
      return NextResponse.json(
        {
          ok: false,
          error: "NO_CREDITS",
          message: "Crédits IA insuffisants.",
        },
        { status: 402 },
      );
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
