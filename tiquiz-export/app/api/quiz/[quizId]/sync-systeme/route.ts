// app/api/quiz/[quizId]/sync-systeme/route.ts
// Bulk export quiz leads to Systeme.io
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sioUserRequest } from "@/lib/sio/userApiClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ quizId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { quizId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { tagName } = await req.json();
    if (!tagName) return NextResponse.json({ ok: false, error: "tagName required" }, { status: 400 });

    // Get API key
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("sio_user_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    const apiKey = String((profile as Record<string, unknown>)?.sio_user_api_key ?? "").trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "No Systeme.io API key configured" }, { status: 400 });
    }

    // Find or create tag
    let tagId: number | null = null;
    const searchRes = await sioUserRequest<{ items: { id: number; name: string }[] }>(apiKey, `/tags?query=${encodeURIComponent(tagName)}&limit=100`);
    if (searchRes.ok && searchRes.data?.items) {
      const match = searchRes.data.items.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
      if (match) tagId = match.id;
    }
    if (!tagId) {
      const createRes = await sioUserRequest<{ id: number }>(apiKey, "/tags", { method: "POST", body: { name: tagName } });
      if (createRes.ok && createRes.data) tagId = createRes.data.id;
    }
    if (!tagId) {
      return NextResponse.json({ ok: false, error: "Failed to create tag in Systeme.io" }, { status: 500 });
    }

    // Get leads
    const { data: leads } = await supabaseAdmin
      .from("quiz_leads")
      .select("email, first_name, last_name, phone, country")
      .eq("quiz_id", quizId);

    let synced = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const lead of leads ?? []) {
      try {
        // Find or create contact
        const findRes = await sioUserRequest<{ items: { id: number }[] }>(apiKey, `/contacts?email=${encodeURIComponent(lead.email)}&limit=10`);
        let contactId: number | null = null;

        if (findRes.ok && findRes.data?.items?.length) {
          contactId = findRes.data.items[0].id;
        } else {
          const fields: { slug: string; value: string }[] = [];
          if (lead.first_name) fields.push({ slug: "first_name", value: lead.first_name });
          if (lead.last_name) fields.push({ slug: "surname", value: lead.last_name });
          if (lead.phone) fields.push({ slug: "phone_number", value: lead.phone });

          const createRes = await sioUserRequest<{ id: number }>(apiKey, "/contacts", {
            method: "POST",
            body: { email: lead.email, locale: "fr", ...(fields.length ? { fields } : {}) },
          });
          if (createRes.ok && createRes.data) contactId = createRes.data.id;
        }

        if (contactId) {
          await sioUserRequest(apiKey, `/contacts/${contactId}/tags`, { method: "POST", body: { tagId } });
          synced++;
        } else {
          errors++;
          if (errorDetails.length < 10) errorDetails.push(`No contact created for ${lead.email}`);
        }

        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        errors++;
        if (errorDetails.length < 10) errorDetails.push(e instanceof Error ? e.message : String(e));
      }
    }

    return NextResponse.json({ ok: true, synced, errors, errorDetails });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
