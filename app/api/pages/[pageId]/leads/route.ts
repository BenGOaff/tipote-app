// app/api/pages/[pageId]/leads/route.ts
// POST: public lead capture (no auth required)
// GET: list leads for page owner (auth required)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getUserDEK } from "@/lib/piiKeys";
import { encryptLeadPII } from "@/lib/piiCrypto";

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
    .select("id, user_id, project_id, title, sio_capture_tag, status")
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

  // ── Sync to unified leads table (non-blocking) ──
  const leadFirstName = String(body?.first_name || "").trim().slice(0, 100);
  const leadPhone = String(body?.phone || "").trim().slice(0, 30);
  (async () => {
    try {
      const dek = await getUserDEK(supabase, page.user_id);
      const encrypted = encryptLeadPII(
        { email, first_name: leadFirstName || null, phone: leadPhone || null },
        dek,
        page.user_id,
      );

      await supabase
        .from("leads")
        .upsert(
          {
            user_id: page.user_id,
            email,
            first_name: leadFirstName || null,
            phone: leadPhone || null,
            ...encrypted,
            source: "landing_page",
            source_id: pageId,
            source_name: (page as any).title ?? null,
            meta: { utm_source, utm_medium, utm_campaign, referrer },
          },
          { onConflict: "user_id,source,source_id,email" },
        );
    } catch (e) {
      console.error("[leads sync] page lead error:", e);
    }
  })();

  // Increment leads_count via RPC (non-blocking)
  supabase
    .rpc("increment_page_leads", { p_page_id: pageId })
    .then(() => {}, () => {});

  // Create toast_event for social proof notifications (non-blocking)
  // Find user's active toast widget and record the signup with the first_name
  createToastEvent({
    userId: page.user_id,
    firstName: String(body?.first_name || "").trim(),
    pageUrl: req.headers.get("referer") || "",
    supabase,
  }).catch(() => {});

  // Systeme.io sync (non-blocking)
  if (page.sio_capture_tag) {
    syncLeadToSystemeIo({ pageId, userId: page.user_id, email, firstName: body?.first_name || "", tagName: page.sio_capture_tag, supabase, projectId: page.project_id }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

// ---------- GET: Owner's leads list (JSON or CSV) ----------

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { pageId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const { data: page } = await supabase
    .from("hosted_pages")
    .select("id, title")
    .eq("id", pageId)
    .eq("user_id", session.user.id)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page introuvable" }, { status: 404 });
  }

  const { data: leads, error } = await supabase
    .from("page_leads")
    .select("id, email, first_name, phone, sio_synced, utm_source, utm_medium, utm_campaign, referrer, created_at")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = leads ?? [];

  // CSV export: GET /api/pages/[pageId]/leads?format=csv
  const url = new URL(req.url);
  if (url.searchParams.get("format") === "csv") {
    const header = "Email,Prénom,Téléphone,Synchronisé SIO,Source UTM,Medium UTM,Campagne UTM,Référent,Date\n";
    const csvRows = rows.map((l: any) =>
      [
        escapeCsv(l.email),
        escapeCsv(l.first_name),
        escapeCsv(l.phone),
        l.sio_synced ? "Oui" : "Non",
        escapeCsv(l.utm_source),
        escapeCsv(l.utm_medium),
        escapeCsv(l.utm_campaign),
        escapeCsv(l.referrer),
        l.created_at ? new Date(l.created_at).toLocaleString("fr-FR") : "",
      ].join(",")
    ).join("\n");

    const csv = "\uFEFF" + header + csvRows; // BOM for Excel
    const filename = `leads-${(page as any).title || pageId}.csv`.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ ok: true, leads: rows });
}

function escapeCsv(val: any): string {
  const s = String(val ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
}

// ---------- Toast event helper ----------

async function createToastEvent(params: {
  userId: string;
  firstName: string;
  pageUrl: string;
  supabase: any;
}) {
  try {
    // Find user's first enabled toast widget
    const { data: widget } = await params.supabase
      .from("toast_widgets")
      .select("id")
      .eq("user_id", params.userId)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!widget?.id) return;

    await params.supabase
      .from("toast_events")
      .insert({
        widget_id: widget.id,
        event_type: "signup",
        visitor_name: params.firstName || null,
        page_url: params.pageUrl.slice(0, 500) || null,
        metadata: {},
      });
  } catch {
    // fail-open
  }
}

// ---------- Systeme.io helper ----------

async function syncLeadToSystemeIo(params: {
  pageId: string;
  userId: string;
  email: string;
  firstName: string;
  tagName: string;
  supabase: any;
  projectId?: string | null;
}) {
  try {
    // Get user's SIO API key (scoped by project)
    let profileQuery = params.supabase
      .from("business_profiles")
      .select("sio_user_api_key")
      .eq("user_id", params.userId);
    if (params.projectId) profileQuery = profileQuery.eq("project_id", params.projectId);
    const { data: profile } = await profileQuery.maybeSingle();

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

    // Mark lead as synced with contact ID
    await params.supabase
      .from("page_leads")
      .update({ sio_synced: true, sio_contact_id: String(contactId) })
      .eq("page_id", params.pageId)
      .eq("email", params.email);
  } catch {
    // fail-open
  }
}
