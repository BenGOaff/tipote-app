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

// ── Systeme.io helpers ──────────────────────────────────────────

async function sioFetch(
  apiKey: string,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
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
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function ensureSioTag(apiKey: string, tagName: string): Promise<number | null> {
  const search = await sioFetch(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
  if (search.ok && Array.isArray((search.data as Record<string, unknown>)?.items)) {
    const items = (search.data as Record<string, unknown[]>).items as Record<string, unknown>[];
    const match = items.find((t) => String(t.name).toLowerCase() === tagName.toLowerCase());
    if (match?.id) return Number(match.id);
  }
  const create = await sioFetch(apiKey, "/tags", { method: "POST", body: { name: tagName } });
  if (create.ok && (create.data as Record<string, unknown>)?.id) return Number((create.data as Record<string, unknown>).id);
  if (create.status === 422) {
    const retry = await sioFetch(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
    if (retry.ok && Array.isArray((retry.data as Record<string, unknown>)?.items)) {
      const items = (retry.data as Record<string, unknown[]>).items as Record<string, unknown>[];
      const match = items.find((t) => String(t.name).toLowerCase() === tagName.toLowerCase());
      if (match?.id) return Number(match.id);
    }
  }
  return null;
}

function buildSioFields(
  fields: { firstName?: string; surname?: string; phoneNumber?: string; country?: string } | undefined,
  includeCountry: boolean,
): { slug: string; value: string }[] {
  if (!fields) return [];
  const out: { slug: string; value: string }[] = [];
  if (fields.firstName) out.push({ slug: "first_name", value: fields.firstName });
  if (fields.surname) out.push({ slug: "surname", value: fields.surname });
  if (fields.phoneNumber) out.push({ slug: "phone_number", value: fields.phoneNumber });
  if (includeCountry && fields.country) out.push({ slug: "country", value: fields.country });
  return out;
}

async function ensureSioContact(
  apiKey: string,
  email: string,
  fields?: { firstName?: string; surname?: string; phoneNumber?: string; country?: string },
): Promise<number | null> {
  const search = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
  if (search.ok && Array.isArray((search.data as Record<string, unknown>)?.items)) {
    const items = (search.data as Record<string, unknown[]>).items as Record<string, unknown>[];
    if (items.length > 0) {
      const existingId = Number(items[0].id);
      if (fields && Object.values(fields).some(Boolean)) {
        const patchFields = buildSioFields(fields, true);
        if (patchFields.length > 0) {
          const patchRes = await sioFetch(apiKey, `/contacts/${existingId}`, { method: "PATCH", body: { fields: patchFields } });
          if (!patchRes.ok && fields.country) {
            const fallback = buildSioFields(fields, false);
            if (fallback.length > 0) await sioFetch(apiKey, `/contacts/${existingId}`, { method: "PATCH", body: { fields: fallback } });
          }
        }
      }
      return existingId;
    }
  }

  const contactBody: Record<string, unknown> = { email, locale: "fr" };
  const sioFields = buildSioFields(fields, true);
  if (sioFields.length > 0) contactBody.fields = sioFields;
  const create = await sioFetch(apiKey, "/contacts", { method: "POST", body: contactBody });
  if (create.ok && (create.data as Record<string, unknown>)?.id) return Number((create.data as Record<string, unknown>).id);

  if (create.status === 422) {
    const retrySearch = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
    if (retrySearch.ok && Array.isArray((retrySearch.data as Record<string, unknown>)?.items)) {
      const items = (retrySearch.data as Record<string, unknown[]>).items as Record<string, unknown>[];
      if (items.length > 0) return Number(items[0].id);
    }
    if (fields?.country) {
      const fallbackBody: Record<string, unknown> = { email, locale: "fr" };
      const fallbackFields = buildSioFields(fields, false);
      if (fallbackFields.length > 0) fallbackBody.fields = fallbackFields;
      const retryCreate = await sioFetch(apiKey, "/contacts", { method: "POST", body: fallbackBody });
      if (retryCreate.ok && (retryCreate.data as Record<string, unknown>)?.id) return Number((retryCreate.data as Record<string, unknown>).id);
    }
  }
  return null;
}

async function applyTagToContact(
  apiKey: string,
  email: string,
  tagName: string,
  fields?: { firstName?: string; surname?: string; phoneNumber?: string; country?: string },
): Promise<number | null> {
  try {
    const tagId = await ensureSioTag(apiKey, tagName);
    if (!tagId) return null;
    const contactId = await ensureSioContact(apiKey, email, fields);
    if (!contactId) return null;
    await sioFetch(apiKey, `/contacts/${contactId}/tags`, { method: "POST", body: { tagId } });
    return contactId;
  } catch (e) {
    console.error("[Systeme.io auto-tag] Error:", e);
    return null;
  }
}

async function enrichSioContact(apiKey: string, contactId: number, quizResultTitle: string) {
  try {
    await sioFetch(apiKey, `/contacts/${contactId}`, {
      method: "PATCH",
      body: { fields: [{ slug: "tiquiz_result", value: quizResultTitle }] },
    });
  } catch (e) {
    console.error("[Systeme.io enrich] Error:", e);
  }
}

async function enrollInSioCourse(apiKey: string, courseId: string, contactId: number) {
  try {
    await sioFetch(apiKey, `/school/courses/${courseId}/enrollments`, { method: "POST", body: { contactId } });
  } catch (e) {
    console.error("[Systeme.io course enrollment] Error:", e);
  }
}

async function addToSioCommunity(apiKey: string, communityId: string, contactId: number) {
  try {
    await sioFetch(apiKey, `/community/communities/${communityId}/memberships`, { method: "POST", body: { contactId } });
  } catch (e) {
    console.error("[Systeme.io community add] Error:", e);
  }
}

// ── GET — public quiz data ───────────────────────────────────────

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    const [quizRes, questionsRes, resultsRes] = await Promise.all([
      admin.from("quizzes").select("id,user_id,title,introduction,cta_text,cta_url,privacy_url,consent_text,virality_enabled,bonus_description,share_message,locale,views_count,capture_heading,capture_subtitle,capture_first_name,capture_last_name,capture_phone,capture_country").eq("id", quizId).eq("status", "active").maybeSingle(),
      admin.from("quiz_questions").select("id,question_text,options,sort_order").eq("quiz_id", quizId).order("sort_order"),
      admin.from("quiz_results").select("id,title,description,insight,projection,cta_text,cta_url,sort_order").eq("quiz_id", quizId).order("sort_order"),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    // Fetch creator's address_form
    const quizUserId = (quizRes.data as Record<string, unknown>).user_id as string | undefined;
    let addressForm = "tu";
    let fallbackPrivacyUrl = "";
    if (quizUserId) {
      const { data: bp } = await admin
        .from("profiles")
        .select("address_form, privacy_url")
        .eq("user_id", quizUserId)
        .maybeSingle();
      addressForm = (bp as Record<string, unknown>)?.address_form === "vous" ? "vous" : "tu";
      fallbackPrivacyUrl = String((bp as Record<string, unknown>)?.privacy_url ?? "").trim();
    }

    // Increment view count (non-blocking)
    admin.from("quizzes").update({ views_count: ((quizRes.data as Record<string, unknown>).views_count as number ?? 0) + 1 }).eq("id", quizId).then(() => {});

    const { user_id: _uid, ...quizPublic } = quizRes.data as Record<string, unknown>;
    const effectivePrivacyUrl = String(quizPublic.privacy_url ?? "").trim() || fallbackPrivacyUrl;

    return NextResponse.json({
      ok: true,
      quiz: { ...quizPublic, address_form: addressForm, privacy_url: effectivePrivacyUrl || null },
      questions: (questionsRes.data ?? []).map((q: Record<string, unknown>) => ({
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

    let body: Record<string, unknown>;
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
      .select("id, user_id, title")
      .eq("id", quizId)
      .eq("status", "active")
      .maybeSingle();

    if (!quiz) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    const resultId = (body.result_id as string) ?? null;
    const firstName = String(body.first_name ?? "").trim().slice(0, 100);
    const lastName = String(body.last_name ?? "").trim().slice(0, 100);
    const phone = String(body.phone ?? "").trim().slice(0, 30);
    const country = String(body.country ?? "").trim().slice(0, 50);
    const answers = Array.isArray(body.answers) ? body.answers : null;

    const { data: lead, error } = await admin
      .from("quiz_leads")
      .upsert(
        {
          quiz_id: quizId,
          email,
          first_name: firstName || null,
          last_name: lastName || null,
          phone: phone || null,
          country: country || null,
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

    // ── Auto-send to Systeme.io (non-blocking) ──
    if (resultId) {
      (async () => {
        try {
          const { data: result } = await admin
            .from("quiz_results")
            .select("sio_tag_name, sio_course_id, sio_community_id, title")
            .eq("id", resultId)
            .maybeSingle();

          const { data: profile } = await admin
            .from("profiles")
            .select("sio_user_api_key")
            .eq("user_id", quiz.user_id)
            .maybeSingle();

          const apiKey = String((profile as Record<string, unknown>)?.sio_user_api_key ?? "").trim();
          if (!apiKey) return;

          const tagName = String((result as Record<string, unknown>)?.sio_tag_name ?? "").trim();
          const courseId = String((result as Record<string, unknown>)?.sio_course_id ?? "").trim();
          const communityId = String((result as Record<string, unknown>)?.sio_community_id ?? "").trim();
          const resultTitle = String((result as Record<string, unknown>)?.title ?? "").trim();

          let sioContactId: number | null = null;
          if (tagName) {
            sioContactId = await applyTagToContact(apiKey, email, tagName, {
              firstName: firstName || undefined,
              surname: lastName || undefined,
              phoneNumber: phone || undefined,
              country: country || undefined,
            });
          } else {
            sioContactId = await ensureSioContact(apiKey, email, {
              firstName: firstName || undefined,
              surname: lastName || undefined,
              phoneNumber: phone || undefined,
              country: country || undefined,
            });
          }

          if (!sioContactId) return;
          if (resultTitle) await enrichSioContact(apiKey, sioContactId, resultTitle);
          if (courseId) await enrollInSioCourse(apiKey, courseId, sioContactId);
          if (communityId) await addToSioCommunity(apiKey, communityId, sioContactId);
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

// ── PATCH — mark share + auto-apply share tag ──────────────────

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    let body: Record<string, unknown>;
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
        .update({ shares_count: ((quiz as Record<string, unknown>).shares_count as number ?? 0) + 1 })
        .eq("id", quizId);

      const shareTagName = String((quiz as Record<string, unknown>).sio_share_tag_name ?? "").trim();
      if (shareTagName && (quiz as Record<string, unknown>).user_id) {
        (async () => {
          try {
            const { data: profile } = await admin
              .from("profiles")
              .select("sio_user_api_key")
              .eq("user_id", (quiz as Record<string, unknown>).user_id as string)
              .maybeSingle();
            const apiKey = String((profile as Record<string, unknown>)?.sio_user_api_key ?? "").trim();
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
