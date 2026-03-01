// app/api/pages/[pageId]/leads/route.ts
// POST: public lead capture (no auth required)
// GET: list leads for page owner (auth required)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ pageId: string }> };

// ---------- POST: Public lead submission ----------

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch the page to get user_id and validate it exists
  const { data: page } = await supabase
    .from("hosted_pages")
    .select("id, user_id, sio_capture_tag, status")
    .eq("id", pageId)
    .eq("status", "published")
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page introuvable" }, { status: 404 });
  }

  // Extract UTM params
  const url = new URL(req.url);
  const utm_source = body?.utm_source || url.searchParams.get("utm_source") || "";
  const utm_medium = body?.utm_medium || url.searchParams.get("utm_medium") || "";
  const utm_campaign = body?.utm_campaign || url.searchParams.get("utm_campaign") || "";
  const referrer = body?.referrer || "";

  // Upsert lead (unique on page_id + email)
  const { data: lead, error } = await supabase
    .from("page_leads")
    .upsert(
      {
        page_id: pageId,
        user_id: page.user_id,
        email,
        first_name: String(body?.first_name || "").trim().slice(0, 100),
        phone: String(body?.phone || "").trim().slice(0, 30),
        custom_fields: body?.custom_fields || {},
        utm_source,
        utm_medium,
        utm_campaign,
        referrer,
      },
      { onConflict: "page_id,email", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (error) {
    // If unique constraint doesn't exist yet, try plain insert
    const { data: lead2, error: err2 } = await supabase
      .from("page_leads")
      .insert({
        page_id: pageId,
        user_id: page.user_id,
        email,
        first_name: String(body?.first_name || "").trim().slice(0, 100),
        phone: String(body?.phone || "").trim().slice(0, 30),
        custom_fields: body?.custom_fields || {},
        utm_source,
        utm_medium,
        utm_campaign,
        referrer,
      })
      .select("id")
      .single();

    if (err2) {
      return NextResponse.json({ error: "Erreur sauvegarde" }, { status: 500 });
    }
  }

  // Increment leads_count (non-blocking)
  supabase
    .from("hosted_pages")
    .update({ leads_count: (page as any).leads_count + 1 })
    .eq("id", pageId)
    .then(() => {});

  // Systeme.io sync (non-blocking)
  if (page.sio_capture_tag) {
    syncLeadToSystemeIo({ userId: page.user_id, email, firstName: body?.first_name || "", tagName: page.sio_capture_tag, supabase }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

// ---------- GET: Owner's leads list ----------

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const { data: page } = await supabase
    .from("hosted_pages")
    .select("id")
    .eq("id", pageId)
    .eq("user_id", session.user.id)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page introuvable" }, { status: 404 });
  }

  const { data: leads, error } = await supabase
    .from("page_leads")
    .select("id, email, first_name, phone, sio_synced, utm_source, created_at")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, leads: leads ?? [] });
}

// ---------- Systeme.io helper ----------

async function syncLeadToSystemeIo(params: {
  userId: string;
  email: string;
  firstName: string;
  tagName: string;
  supabase: any;
}) {
  try {
    // Get user's SIO API key
    const { data: profile } = await params.supabase
      .from("business_profiles")
      .select("sio_user_api_key")
      .eq("user_id", params.userId)
      .maybeSingle();

    const apiKey = (profile as any)?.sio_user_api_key;
    if (!apiKey) return;

    const headers = { "X-API-Key": apiKey, "Content-Type": "application/json" };
    const base = "https://api.systeme.io/api";

    // Find or create tag
    const tagRes = await fetch(`${base}/tags?name=${encodeURIComponent(params.tagName)}`, { headers });
    const tagData = await tagRes.json();
    let tagId = tagData?.items?.[0]?.id;

    if (!tagId) {
      const createTag = await fetch(`${base}/tags`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: params.tagName }),
      });
      const created = await createTag.json();
      tagId = created?.id;
    }

    if (!tagId) return;

    // Find or create contact
    const contactRes = await fetch(`${base}/contacts?email=${encodeURIComponent(params.email)}`, { headers });
    const contactData = await contactRes.json();
    let contactId = contactData?.items?.[0]?.id;

    if (!contactId) {
      const createContact = await fetch(`${base}/contacts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: params.email,
          firstName: params.firstName || undefined,
        }),
      });
      const created = await createContact.json();
      contactId = created?.id;
    }

    if (!contactId) return;

    // Apply tag to contact
    await fetch(`${base}/contacts/${contactId}/tags`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tagId }),
    });
  } catch {
    // fail-open
  }
}
