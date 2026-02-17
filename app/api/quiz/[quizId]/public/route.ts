// app/api/quiz/[quizId]/public/route.ts
// Public endpoints for quiz visitors (no auth required).
// GET: fetch active quiz data
// POST: submit lead (email capture) + auto-send to Systeme.io with result tag
// PATCH: mark share + auto-apply share tag in Systeme.io

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ quizId: string }> };

const SIO_BASE = "https://api.systeme.io/api";

// ── Systeme.io helper ──────────────────────────────────────────

async function sioFetch(
  apiKey: string,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
  };
  let payload: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(opts.body);
  }
  const res = await fetch(`${SIO_BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Find-or-create a tag in Systeme.io, returns tagId or null.
 */
async function ensureSioTag(apiKey: string, tagName: string): Promise<number | null> {
  // Search existing
  const search = await sioFetch(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
  if (search.ok && Array.isArray(search.data?.items)) {
    const match = search.data.items.find(
      (t: any) => String(t.name).toLowerCase() === tagName.toLowerCase(),
    );
    if (match?.id) return Number(match.id);
  }
  // Create
  const create = await sioFetch(apiKey, "/tags", { method: "POST", body: { name: tagName } });
  if (create.ok && create.data?.id) return Number(create.data.id);
  // Retry search (422 = already exists with slight mismatch)
  if (create.status === 422) {
    const retry = await sioFetch(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
    if (retry.ok && Array.isArray(retry.data?.items)) {
      const match = retry.data.items.find(
        (t: any) => String(t.name).toLowerCase() === tagName.toLowerCase(),
      );
      if (match?.id) return Number(match.id);
    }
  }
  return null;
}

/**
 * Find-or-create a contact in Systeme.io, returns contactId or null.
 */
async function ensureSioContact(apiKey: string, email: string): Promise<number | null> {
  const search = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
  if (search.ok && Array.isArray(search.data?.items) && search.data.items.length > 0) {
    return Number(search.data.items[0].id);
  }
  const create = await sioFetch(apiKey, "/contacts", { method: "POST", body: { email, locale: "fr" } });
  if (create.ok && create.data?.id) return Number(create.data.id);
  // 422 = contact already exists
  if (create.status === 422) {
    const retry = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
    if (retry.ok && Array.isArray(retry.data?.items) && retry.data.items.length > 0) {
      return Number(retry.data.items[0].id);
    }
  }
  return null;
}

/**
 * Apply a tag to a contact in Systeme.io (fire & forget style).
 */
async function applyTagToContact(apiKey: string, email: string, tagName: string) {
  try {
    const tagId = await ensureSioTag(apiKey, tagName);
    if (!tagId) return;
    const contactId = await ensureSioContact(apiKey, email);
    if (!contactId) return;
    await sioFetch(apiKey, `/contacts/${contactId}/tags`, { method: "POST", body: { tagId } });
  } catch (e) {
    console.error("[Systeme.io auto-tag] Error:", e);
  }
}

// ── GET — public quiz data (only active quizzes) ───────────────

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    const [quizRes, questionsRes, resultsRes] = await Promise.all([
      admin.from("quizzes").select("id,title,introduction,cta_text,cta_url,privacy_url,consent_text,virality_enabled,bonus_description,share_message,locale,views_count").eq("id", quizId).eq("status", "active").maybeSingle(),
      admin.from("quiz_questions").select("id,question_text,options,sort_order").eq("quiz_id", quizId).order("sort_order"),
      admin.from("quiz_results").select("id,title,description,insight,projection,cta_text,cta_url,sort_order").eq("quiz_id", quizId).order("sort_order"),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    // Increment view count (non-blocking)
    admin.from("quizzes").update({ views_count: (quizRes.data.views_count ?? 0) + 1 }).eq("id", quizId).then(() => {});

    return NextResponse.json({
      ok: true,
      quiz: quizRes.data,
      questions: (questionsRes.data ?? []).map((q: any) => ({
        ...q,
        options: q.options as { text: string; result_index: number }[],
      })),
      results: resultsRes.data ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── POST — submit lead + auto-tag in Systeme.io ────────────────

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
    }

    // Verify quiz is active
    const { data: quiz } = await admin
      .from("quizzes")
      .select("id, user_id")
      .eq("id", quizId)
      .eq("status", "active")
      .maybeSingle();

    if (!quiz) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    const resultId = body.result_id ?? null;

    // Upsert lead (unique on quiz_id + email)
    const { data: lead, error } = await admin
      .from("quiz_leads")
      .upsert(
        {
          quiz_id: quizId,
          email,
          result_id: resultId,
          consent_given: Boolean(body.consent_given),
        },
        { onConflict: "quiz_id,email" },
      )
      .select("id")
      .single();

    if (error) {
      console.error("[POST /api/quiz/[quizId]/public] Lead insert error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // ── Auto-send to Systeme.io with result tag (non-blocking) ──
    if (resultId) {
      // Fire & forget: don't await so the response is fast
      (async () => {
        try {
          // Get the result's sio_tag_name
          const { data: result } = await admin
            .from("quiz_results")
            .select("sio_tag_name")
            .eq("id", resultId)
            .maybeSingle();

          const tagName = String(result?.sio_tag_name ?? "").trim();
          if (!tagName) return;

          // Get the quiz owner's API key
          const { data: profile } = await admin
            .from("business_profiles")
            .select("sio_user_api_key")
            .eq("user_id", quiz.user_id)
            .maybeSingle();

          const apiKey = String(profile?.sio_user_api_key ?? "").trim();
          if (!apiKey) return;

          await applyTagToContact(apiKey, email, tagName);
          console.log(`[Systeme.io] Tagged ${email} with "${tagName}" for quiz ${quizId}`);
        } catch (e) {
          console.error("[Systeme.io auto-tag POST] Error:", e);
        }
      })();
    }

    return NextResponse.json({ ok: true, leadId: lead?.id });
  } catch (e) {
    console.error("[POST /api/quiz/[quizId]/public] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── PATCH — mark share + auto-apply share tag ──────────────────

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: "Email required" }, { status: 400 });
    }

    const { error } = await admin
      .from("quiz_leads")
      .update({ has_shared: true, bonus_unlocked: true })
      .eq("quiz_id", quizId)
      .eq("email", email);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Increment share count on quiz + get share tag
    const { data: quiz } = await admin
      .from("quizzes")
      .select("shares_count, sio_share_tag_name, user_id")
      .eq("id", quizId)
      .maybeSingle();

    if (quiz) {
      await admin
        .from("quizzes")
        .update({ shares_count: (quiz.shares_count ?? 0) + 1 })
        .eq("id", quizId);

      // ── Auto-apply share tag in Systeme.io (non-blocking) ──
      const shareTagName = String(quiz.sio_share_tag_name ?? "").trim();
      if (shareTagName && quiz.user_id) {
        (async () => {
          try {
            const { data: profile } = await admin
              .from("business_profiles")
              .select("sio_user_api_key")
              .eq("user_id", quiz.user_id)
              .maybeSingle();

            const apiKey = String(profile?.sio_user_api_key ?? "").trim();
            if (!apiKey) return;

            await applyTagToContact(apiKey, email, shareTagName);
            console.log(`[Systeme.io] Tagged ${email} with share tag "${shareTagName}" for quiz ${quizId}`);
          } catch (e) {
            console.error("[Systeme.io auto-tag PATCH] Error:", e);
          }
        })();
      }
    }

    return NextResponse.json({ ok: true, bonus_unlocked: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
