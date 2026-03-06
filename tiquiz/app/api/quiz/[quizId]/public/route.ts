// app/api/quiz/[quizId]/public/route.ts
// Public endpoints for quiz visitors (no auth required).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ quizId: string }> };

const SIO_BASE = "https://api.systeme.io/api";

// ── Systeme.io helpers ──────────────────────────────────────────

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

async function ensureSioTag(apiKey: string, tagName: string): Promise<number | null> {
  const search = await sioFetch(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
  if (search.ok && Array.isArray(search.data?.items)) {
    const match = search.data.items.find(
      (t: any) => String(t.name).toLowerCase() === tagName.toLowerCase(),
    );
    if (match?.id) return Number(match.id);
  }
  const create = await sioFetch(apiKey, "/tags", { method: "POST", body: { name: tagName } });
  if (create.ok && create.data?.id) return Number(create.data.id);
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

async function ensureSioContact(apiKey: string, email: string, firstName?: string): Promise<number | null> {
  const search = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
  if (search.ok && Array.isArray(search.data?.items) && search.data.items.length > 0) {
    return Number(search.data.items[0].id);
  }
  const contactBody: Record<string, string> = { email, locale: "fr" };
  if (firstName) contactBody.firstName = firstName;
  const create = await sioFetch(apiKey, "/contacts", { method: "POST", body: contactBody });
  if (create.ok && create.data?.id) return Number(create.data.id);
  if (create.status === 422) {
    const retry = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
    if (retry.ok && Array.isArray(retry.data?.items) && retry.data.items.length > 0) {
      return Number(retry.data.items[0].id);
    }
  }
  return null;
}

async function applyTagToContact(apiKey: string, email: string, tagName: string, firstName?: string) {
  try {
    const tagId = await ensureSioTag(apiKey, tagName);
    if (!tagId) return;
    const contactId = await ensureSioContact(apiKey, email, firstName);
    if (!contactId) return;
    await sioFetch(apiKey, `/contacts/${contactId}/tags`, { method: "POST", body: { tagId } });
  } catch (e) {
    console.error("[Systeme.io auto-tag] Error:", e);
  }
}

// ── GET — public quiz data ──────────────────────────────────────

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    const [quizRes, questionsRes, resultsRes] = await Promise.all([
      admin.from("quizzes").select("id,user_id,title,introduction,cta_text,cta_url,privacy_url,consent_text,virality_enabled,bonus_description,share_message,locale,views_count,capture_heading,capture_subtitle,capture_first_name").eq("id", quizId).eq("status", "active").maybeSingle(),
      admin.from("quiz_questions").select("id,question_text,options,sort_order").eq("quiz_id", quizId).order("sort_order"),
      admin.from("quiz_results").select("id,title,description,insight,projection,cta_text,cta_url,sort_order").eq("quiz_id", quizId).order("sort_order"),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    // Fetch creator's address_form from profiles
    const quizUserId = (quizRes.data as any).user_id as string | undefined;
    let addressForm = "tu";
    let fallbackPrivacyUrl = "";
    if (quizUserId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("address_form, privacy_url")
        .eq("id", quizUserId)
        .maybeSingle();
      addressForm = (profile as any)?.address_form === "vous" ? "vous" : "tu";
      fallbackPrivacyUrl = String((profile as any)?.privacy_url ?? "").trim();
    }

    // Increment view count (non-blocking)
    admin.from("quizzes").update({ views_count: (quizRes.data.views_count ?? 0) + 1 }).eq("id", quizId).then(() => {});

    const { user_id: _uid, ...quizPublic } = quizRes.data as any;
    const effectivePrivacyUrl = String(quizPublic.privacy_url ?? "").trim() || fallbackPrivacyUrl;

    return NextResponse.json({
      ok: true,
      quiz: { ...quizPublic, address_form: addressForm, privacy_url: effectivePrivacyUrl || null },
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

// ── POST — submit lead ──────────────────────────────────────────

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
    const firstName = String(body.first_name ?? "").trim().slice(0, 100);
    const answers = Array.isArray(body.answers) ? body.answers : null;

    const { data: lead, error } = await admin
      .from("quiz_leads")
      .upsert(
        {
          quiz_id: quizId,
          email,
          first_name: firstName || null,
          result_id: resultId,
          consent_given: Boolean(body.consent_given),
          ...(answers ? { answers } : {}),
        },
        { onConflict: "quiz_id,email" },
      )
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // Auto-send to Systeme.io (fire & forget)
    if (resultId) {
      (async () => {
        try {
          const { data: result } = await admin
            .from("quiz_results")
            .select("sio_tag_name")
            .eq("id", resultId)
            .maybeSingle();

          const tagName = String(result?.sio_tag_name ?? "").trim();
          if (!tagName) return;

          const { data: profile } = await admin
            .from("profiles")
            .select("sio_user_api_key")
            .eq("id", quiz.user_id)
            .maybeSingle();

          const apiKey = String((profile as any)?.sio_user_api_key ?? "").trim();
          if (!apiKey) return;

          await applyTagToContact(apiKey, email, tagName, firstName || undefined);
        } catch (e) {
          console.error("[Systeme.io auto-tag POST] Error:", e);
        }
      })();
    }

    return NextResponse.json({ ok: true, leadId: lead?.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── PATCH — mark share ──────────────────────────────────────────

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

    await admin
      .from("quiz_leads")
      .update({ has_shared: true, bonus_unlocked: true })
      .eq("quiz_id", quizId)
      .eq("email", email);

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

      const shareTagName = String(quiz.sio_share_tag_name ?? "").trim();
      if (shareTagName && quiz.user_id) {
        (async () => {
          try {
            const { data: profile } = await admin
              .from("profiles")
              .select("sio_user_api_key")
              .eq("id", quiz.user_id)
              .maybeSingle();

            const apiKey = String((profile as any)?.sio_user_api_key ?? "").trim();
            if (!apiKey) return;

            await applyTagToContact(apiKey, email, shareTagName);
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
