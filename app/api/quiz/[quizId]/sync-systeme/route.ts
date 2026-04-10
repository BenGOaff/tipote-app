// app/api/quiz/[quizId]/sync-systeme/route.ts
// Export quiz leads to user's Systeme.io account (create contacts + assign tag)
// Uses the user's own Systeme.io API key stored in business_profiles.sio_user_api_key

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ quizId: string }> };

const SIO_BASE = "https://api.systeme.io/api";

async function sioRequest(
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

  const res = await fetch(`${SIO_BASE}${path}`, {
    method,
    headers,
    body: payload,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { quizId } = await context.params;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const tagName = String(body.tagName ?? "").trim();
    if (!tagName) {
      return NextResponse.json(
        { ok: false, error: "tagName is required" },
        { status: 400 },
      );
    }

    // Get user's Systeme.io API key (scoped by active project)
    const projectId = await getActiveProjectId(supabase, user.id);
    let profileQuery = supabase
      .from("business_profiles")
      .select("sio_user_api_key")
      .eq("user_id", user.id);
    if (projectId) profileQuery = profileQuery.eq("project_id", projectId);
    const { data: profile } = await profileQuery.maybeSingle();

    const apiKey = String(profile?.sio_user_api_key ?? "").trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "NO_API_KEY",
          message:
            "Configure ta clé API Systeme.io dans Réglages avant d'exporter.",
        },
        { status: 400 },
      );
    }

    // Verify quiz ownership
    const { data: quiz } = await supabase
      .from("quizzes")
      .select("id")
      .eq("id", quizId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!quiz) {
      return NextResponse.json(
        { ok: false, error: "Quiz not found" },
        { status: 404 },
      );
    }

    // Get quiz leads
    const { data: leads } = await supabase
      .from("quiz_leads")
      .select("id, email, first_name, last_name, phone, country")
      .eq("quiz_id", quizId);

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        ok: true,
        synced: 0,
        message: "Aucun lead à synchroniser.",
      });
    }

    // Step 1: Find or create the tag in Systeme.io
    let tagId: number | null = null;

    // Search existing tags
    const tagSearch = await sioRequest(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
    if (tagSearch.ok && Array.isArray(tagSearch.data?.items)) {
      const match = tagSearch.data.items.find(
        (t: any) => String(t.name).toLowerCase() === tagName.toLowerCase(),
      );
      if (match?.id) tagId = Number(match.id);
    }

    // Create tag if not found
    if (!tagId) {
      const createTag = await sioRequest(apiKey, "/tags", {
        method: "POST",
        body: { name: tagName },
      });
      if (createTag.ok && createTag.data?.id) {
        tagId = Number(createTag.data.id);
      } else if (createTag.status === 422) {
        // Tag might already exist with slight mismatch, try fetching again
        const retry = await sioRequest(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
        if (retry.ok && Array.isArray(retry.data?.items)) {
          const match = retry.data.items.find(
            (t: any) => String(t.name).toLowerCase() === tagName.toLowerCase(),
          );
          if (match?.id) tagId = Number(match.id);
        }
      }

      if (!tagId) {
        return NextResponse.json(
          {
            ok: false,
            error: "TAG_CREATE_FAILED",
            message: `Impossible de créer le tag "${tagName}" dans Systeme.io.`,
          },
          { status: 400 },
        );
      }
    }

    // Step 2: For each lead, create/find contact + assign tag
    let synced = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const lead of leads) {
      const email = String(lead.email).trim().toLowerCase();
      if (!email) continue;

      try {
        // Check if contact exists
        const search = await sioRequest(
          apiKey,
          `/contacts?email=${encodeURIComponent(email)}&limit=10`,
        );

        let contactId: number | null = null;

        if (search.ok && Array.isArray(search.data?.items) && search.data.items.length > 0) {
          contactId = Number(search.data.items[0].id);
        } else {
          // Create contact with all available fields (SIO requires fields array with slugs)
          const contactBody: Record<string, unknown> = { email, locale: "fr" };
          const sioFields: { slug: string; value: string }[] = [];
          if (lead.first_name) sioFields.push({ slug: "first_name", value: lead.first_name });
          if (lead.last_name) sioFields.push({ slug: "surname", value: lead.last_name });
          if (lead.phone) sioFields.push({ slug: "phone_number", value: lead.phone });
          if (lead.country) sioFields.push({ slug: "country", value: lead.country });
          if (sioFields.length > 0) contactBody.fields = sioFields;
          const create = await sioRequest(apiKey, "/contacts", {
            method: "POST",
            body: contactBody,
          });
          if (create.ok && create.data?.id) {
            contactId = Number(create.data.id);
          } else if (create.status === 422) {
            // 422 can mean: (a) contact already exists, or (b) invalid field slug ("country")
            const retrySearch = await sioRequest(
              apiKey,
              `/contacts?email=${encodeURIComponent(email)}&limit=10`,
            );
            if (retrySearch.ok && Array.isArray(retrySearch.data?.items) && retrySearch.data.items.length > 0) {
              contactId = Number(retrySearch.data.items[0].id);
            } else if (lead.country) {
              // Contact doesn't exist — 422 was due to invalid "country" slug. Retry without it.
              const fallbackBody: Record<string, unknown> = { email, locale: "fr" };
              const fallbackFields: { slug: string; value: string }[] = [];
              if (lead.first_name) fallbackFields.push({ slug: "first_name", value: lead.first_name });
              if (lead.last_name) fallbackFields.push({ slug: "surname", value: lead.last_name });
              if (lead.phone) fallbackFields.push({ slug: "phone_number", value: lead.phone });
              if (fallbackFields.length > 0) fallbackBody.fields = fallbackFields;
              const retryCreate = await sioRequest(apiKey, "/contacts", {
                method: "POST",
                body: fallbackBody,
              });
              if (retryCreate.ok && retryCreate.data?.id) {
                contactId = Number(retryCreate.data.id);
              } else if (retryCreate.status === 422) {
                const finalSearch = await sioRequest(apiKey, `/contacts?email=${encodeURIComponent(email)}&limit=10`);
                if (finalSearch.ok && Array.isArray(finalSearch.data?.items) && finalSearch.data.items.length > 0) {
                  contactId = Number(finalSearch.data.items[0].id);
                }
              }
            }
          }
        }

        if (!contactId) {
          errors++;
          errorDetails.push(`${email}: contact not found/created`);
          continue;
        }

        // Assign tag to contact
        const tagRes = await sioRequest(apiKey, `/contacts/${contactId}/tags`, {
          method: "POST",
          body: { tagId },
        });

        // 204 = success, 422 = tag already assigned (both OK)
        if (tagRes.ok || tagRes.status === 204 || tagRes.status === 422) {
          synced++;
        } else {
          errors++;
          errorDetails.push(`${email}: tag assign failed (${tagRes.status})`);
        }

        // Small delay to respect rate limiting
        if (leads.length > 5) {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (e: any) {
        errors++;
        errorDetails.push(`${email}: ${e.message || "unknown error"}`);
      }
    }

    return NextResponse.json({
      ok: true,
      synced,
      errors,
      total: leads.length,
      tagId,
      tagName,
      errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined,
    });
  } catch (e) {
    console.error("[POST /api/quiz/[quizId]/sync-systeme] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
