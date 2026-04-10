// app/api/quiz/[quizId]/public/route.ts
// Public endpoints for quiz visitors (no auth required).
// GET: fetch active quiz data
// POST: submit lead (email capture) + auto-send to Systeme.io with result tag
// PATCH: mark share + auto-apply share tag in Systeme.io

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserDEK } from "@/lib/piiKeys";
import { encryptLeadPII } from "@/lib/piiCrypto";

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
 * Build SIO custom fields array from our field map.
 * `includeCountry` allows retrying without the country slug if SIO rejects it.
 */
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

/**
 * Find-or-create a contact in Systeme.io, returns contactId or null.
 * Handles SIO accounts that don't have a "country" custom field:
 * if creating/updating with country fails (422), retries WITHOUT country.
 */
async function ensureSioContact(
  apiKey: string,
  email: string,
  fields?: { firstName?: string; surname?: string; phoneNumber?: string; country?: string },
): Promise<number | null> {
  const search = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
  if (search.ok && Array.isArray(search.data?.items) && search.data.items.length > 0) {
    const existingId = Number(search.data.items[0].id);
    // Update existing contact with any new fields (phone, country, name)
    if (fields && Object.values(fields).some(Boolean)) {
      const patchFields = buildSioFields(fields, true);
      if (patchFields.length > 0) {
        const patchRes = await sioFetch(apiKey, `/contacts/${existingId}`, {
          method: "PATCH",
          body: { fields: patchFields },
        });
        // If PATCH failed (likely invalid "country" slug), retry without country
        if (!patchRes.ok && fields.country) {
          const fallbackFields = buildSioFields(fields, false);
          if (fallbackFields.length > 0) {
            await sioFetch(apiKey, `/contacts/${existingId}`, {
              method: "PATCH",
              body: { fields: fallbackFields },
            });
          }
        }
      }
    }
    return existingId;
  }

  // Contact not found — create it
  const contactBody: Record<string, unknown> = { email, locale: "fr" };
  const sioFields = buildSioFields(fields, true);
  if (sioFields.length > 0) contactBody.fields = sioFields;

  const create = await sioFetch(apiKey, "/contacts", { method: "POST", body: contactBody });
  if (create.ok && create.data?.id) return Number(create.data.id);

  // 422 can mean: (a) contact already exists, or (b) invalid field slug (e.g. "country")
  if (create.status === 422) {
    // First check if the contact actually exists (case a)
    const retrySearch = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
    if (retrySearch.ok && Array.isArray(retrySearch.data?.items) && retrySearch.data.items.length > 0) {
      return Number(retrySearch.data.items[0].id);
    }

    // Contact doesn't exist — the 422 was likely due to invalid field slug (case b: "country")
    // Retry creation without country field
    if (fields?.country) {
      const fallbackBody: Record<string, unknown> = { email, locale: "fr" };
      const fallbackFields = buildSioFields(fields, false);
      if (fallbackFields.length > 0) fallbackBody.fields = fallbackFields;

      const retryCreate = await sioFetch(apiKey, "/contacts", { method: "POST", body: fallbackBody });
      if (retryCreate.ok && retryCreate.data?.id) return Number(retryCreate.data.id);

      // Still 422? Truly already exists
      if (retryCreate.status === 422) {
        const finalSearch = await sioFetch(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
        if (finalSearch.ok && Array.isArray(finalSearch.data?.items) && finalSearch.data.items.length > 0) {
          return Number(finalSearch.data.items[0].id);
        }
      }
    }
  }
  return null;
}

/**
 * Apply a tag to a contact in Systeme.io (fire & forget style).
 */
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

/**
 * Enrich SIO contact with quiz result as custom field.
 */
async function enrichSioContact(
  apiKey: string,
  contactId: number,
  quizResultTitle: string,
) {
  try {
    await sioFetch(apiKey, `/contacts/${contactId}`, {
      method: "PATCH",
      body: {
        fields: [
          { slug: "tipote_quiz_result", value: quizResultTitle },
        ],
      },
    });
  } catch (e) {
    console.error("[Systeme.io enrich] Error:", e);
  }
}

/**
 * Enroll a SIO contact in a course.
 */
async function enrollInSioCourse(apiKey: string, courseId: string, contactId: number) {
  try {
    const res = await sioFetch(apiKey, `/school/courses/${courseId}/enrollments`, {
      method: "POST",
      body: { contactId },
    });
    if (res.ok) {
      console.log(`[Systeme.io] Enrolled contact ${contactId} in course ${courseId}`);
    } else {
      console.warn(`[Systeme.io] Course enrollment failed (${res.status}):`, res.data);
    }
  } catch (e) {
    console.error("[Systeme.io course enrollment] Error:", e);
  }
}

/**
 * Add a SIO contact to a community.
 */
async function addToSioCommunity(apiKey: string, communityId: string, contactId: number) {
  try {
    const res = await sioFetch(apiKey, `/community/communities/${communityId}/memberships`, {
      method: "POST",
      body: { contactId },
    });
    if (res.ok) {
      console.log(`[Systeme.io] Added contact ${contactId} to community ${communityId}`);
    } else {
      console.warn(`[Systeme.io] Community add failed (${res.status}):`, res.data);
    }
  } catch (e) {
    console.error("[Systeme.io community add] Error:", e);
  }
}

// ── GET — public quiz data (only active quizzes) ───────────────

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const admin = supabaseAdmin;

    const [quizRes, questionsRes, resultsRes] = await Promise.all([
      admin.from("quizzes").select("id,user_id,project_id,title,introduction,cta_text,cta_url,privacy_url,consent_text,virality_enabled,bonus_description,share_message,locale,views_count,capture_heading,capture_subtitle,capture_first_name,capture_last_name,capture_phone,capture_country").eq("id", quizId).eq("status", "active").maybeSingle(),
      admin.from("quiz_questions").select("id,question_text,options,sort_order").eq("quiz_id", quizId).order("sort_order"),
      admin.from("quiz_results").select("id,title,description,insight,projection,cta_text,cta_url,sort_order").eq("quiz_id", quizId).order("sort_order"),
    ]);

    if (!quizRes.data) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    // Fetch creator's address_form + privacy_url fallback from business_profiles
    const quizUserId = (quizRes.data as any).user_id as string | undefined;
    let addressForm = "tu";
    let fallbackPrivacyUrl = "";
    if (quizUserId) {
      const { data: bp } = await admin
        .from("business_profiles")
        .select("address_form, privacy_url")
        .eq("user_id", quizUserId)
        .maybeSingle();
      addressForm = (bp as any)?.address_form === "vous" ? "vous" : "tu";
      fallbackPrivacyUrl = String((bp as any)?.privacy_url ?? "").trim();
    }

    // Increment view count (non-blocking)
    admin.from("quizzes").update({ views_count: (quizRes.data.views_count ?? 0) + 1 }).eq("id", quizId).then(() => {});

    // Look up user's enabled widgets (toast + share)
    let toastWidgetId: string | null = null;
    let shareWidgetId: string | null = null;
    if (quizUserId) {
      try {
        const [twRes, swRes] = await Promise.all([
          admin
            .from("toast_widgets")
            .select("id")
            .eq("user_id", quizUserId)
            .eq("enabled", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
          admin
            .from("social_share_widgets")
            .select("id")
            .eq("user_id", quizUserId)
            .eq("enabled", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);
        toastWidgetId = twRes.data?.id || null;
        shareWidgetId = swRes.data?.id || null;
      } catch {
        // fail-open
      }
    }

    // Strip user_id from public response, inject address_form + fallback privacy_url
    const { user_id: _uid, ...quizPublic } = quizRes.data as any;
    const effectivePrivacyUrl = String(quizPublic.privacy_url ?? "").trim() || fallbackPrivacyUrl;

    return NextResponse.json({
      ok: true,
      toast_widget_id: toastWidgetId,
      share_widget_id: shareWidgetId,
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
      .select("id, user_id, project_id, title")
      .eq("id", quizId)
      .eq("status", "active")
      .maybeSingle();

    if (!quiz) {
      return NextResponse.json({ ok: false, error: "Quiz not found or inactive" }, { status: 404 });
    }

    const resultId = body.result_id ?? null;
    const firstName = String(body.first_name ?? "").trim().slice(0, 100);
    const lastName = String(body.last_name ?? "").trim().slice(0, 100);
    const phone = String(body.phone ?? "").trim().slice(0, 30);
    const country = String(body.country ?? "").trim().slice(0, 50);
    const answers = Array.isArray(body.answers) ? body.answers : null;

    // Upsert lead (unique on quiz_id + email)
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
      console.error("[POST /api/quiz/[quizId]/public] Lead insert error:", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // ── Sync to unified leads table (non-blocking) ──
    (async () => {
      try {
        // Get result title
        let resultTitle: string | null = null;
        if (resultId) {
          const { data: result } = await admin
            .from("quiz_results")
            .select("title")
            .eq("id", resultId)
            .maybeSingle();
          resultTitle = result?.title ?? null;
        }

        // Encrypt PII with user's DEK
        const dek = await getUserDEK(admin, quiz.user_id);
        const encrypted = encryptLeadPII(
          { email, first_name: firstName || null, last_name: lastName || null, phone: phone || null, quiz_answers: answers },
          dek,
          quiz.user_id,
        );

        await admin
          .from("leads")
          .upsert(
            {
              user_id: quiz.user_id,
              email,
              first_name: firstName || null,
              last_name: lastName || null,
              phone: phone || null,
              ...encrypted,
              source: "quiz",
              source_id: quizId,
              source_name: quiz.title,
              quiz_answers: answers,
              quiz_result_title: resultTitle,
            },
            { onConflict: "user_id,source,source_id,email" },
          );
      } catch (e) {
        console.error("[leads sync] quiz lead error:", e);
      }
    })();

    // ── Auto-send to Systeme.io: tag + enrich + course + community (non-blocking) ──
    if (resultId) {
      // Fire & forget: don't await so the response is fast
      (async () => {
        try {
          // Get the result's SIO config (tag, course, community)
          const { data: result } = await admin
            .from("quiz_results")
            .select("sio_tag_name, sio_course_id, sio_community_id, title")
            .eq("id", resultId)
            .maybeSingle();

          // Get the quiz owner's API key (scoped by project)
          let profileQuery = admin
            .from("business_profiles")
            .select("sio_user_api_key")
            .eq("user_id", quiz.user_id);
          if (quiz.project_id) profileQuery = profileQuery.eq("project_id", quiz.project_id);
          const { data: profile } = await profileQuery.maybeSingle();

          const apiKey = String(profile?.sio_user_api_key ?? "").trim();
          if (!apiKey) return;

          const tagName = String(result?.sio_tag_name ?? "").trim();
          const courseId = String(result?.sio_course_id ?? "").trim();
          const communityId = String(result?.sio_community_id ?? "").trim();
          const resultTitle = String(result?.title ?? "").trim();

          // 1. Tag the contact (and get the SIO contact ID back)
          let sioContactId: number | null = null;
          if (tagName) {
            sioContactId = await applyTagToContact(apiKey, email, tagName, {
              firstName: firstName || undefined,
              surname: lastName || undefined,
              phoneNumber: phone || undefined,
              country: country || undefined,
            });
            console.log(`[Systeme.io] Tagged ${email} with "${tagName}" for quiz ${quizId}`);
          } else {
            // No tag but we still need the contact ID for other actions
            sioContactId = await ensureSioContact(apiKey, email, {
              firstName: firstName || undefined,
              surname: lastName || undefined,
              phoneNumber: phone || undefined,
              country: country || undefined,
            });
          }

          if (!sioContactId) return;

          // 2. Enrich contact with quiz result as custom field
          if (resultTitle) {
            await enrichSioContact(apiKey, sioContactId, resultTitle);
          }

          // 3. Auto-enroll in SIO course if configured
          if (courseId) {
            await enrollInSioCourse(apiKey, courseId, sioContactId);
          }

          // 4. Auto-add to SIO community if configured
          if (communityId) {
            await addToSioCommunity(apiKey, communityId, sioContactId);
          }
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
      .select("shares_count, sio_share_tag_name, user_id, project_id")
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
            let shareProfileQuery = admin
              .from("business_profiles")
              .select("sio_user_api_key")
              .eq("user_id", quiz.user_id);
            if (quiz.project_id) shareProfileQuery = shareProfileQuery.eq("project_id", quiz.project_id);
            const { data: profile } = await shareProfileQuery.maybeSingle();

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
