// app/api/admin/sanitize-pages/route.ts
// Admin endpoint to clean editor artifacts from all existing html_snapshots.
// POST /api/admin/sanitize-pages — scans all published pages and sanitizes their html_snapshot.
// Optionally pass { slug: "some-slug" } to sanitize a single page.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";
import { sanitizeHtmlSnapshot } from "@/lib/sanitizeHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editor artifact markers to detect dirty snapshots
const ARTIFACT_MARKERS = [
  "data-tipote-injected",
  "data-tp-section-idx",
  'contenteditable="',
  "tipote-toolbar",
  "tipote:text-edit",
  "tipote:sections-list",
  "z-index: 99999",
  "z-index: 99989",
  "z-index:99999",
  "z-index:99989",
];

function hasDirtyArtifacts(html: string): boolean {
  return ARTIFACT_MARKERS.some((m) => html.includes(m));
}

export async function POST(req: NextRequest) {
  // Admin auth check
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id || !isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetSlug = (body as any)?.slug as string | undefined;

  // Fetch pages — either single slug or all published
  let query = supabaseAdmin
    .from("hosted_pages")
    .select("id, slug, html_snapshot")
    .neq("status", "archived");

  if (targetSlug) {
    query = query.eq("slug", targetSlug);
  }

  const { data: pages, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!pages || pages.length === 0) {
    return NextResponse.json({ ok: true, message: "No pages found", cleaned: 0 });
  }

  let cleaned = 0;
  let skipped = 0;
  const results: Array<{ slug: string; status: string }> = [];

  for (const page of pages) {
    const html = page.html_snapshot;
    if (!html || !hasDirtyArtifacts(html)) {
      skipped++;
      results.push({ slug: page.slug, status: "clean" });
      continue;
    }

    const sanitized = sanitizeHtmlSnapshot(html);

    // Only update if something actually changed
    if (sanitized === html) {
      skipped++;
      results.push({ slug: page.slug, status: "unchanged" });
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("hosted_pages")
      .update({ html_snapshot: sanitized })
      .eq("id", page.id);

    if (updateError) {
      results.push({ slug: page.slug, status: `error: ${updateError.message}` });
    } else {
      cleaned++;
      results.push({ slug: page.slug, status: "sanitized" });
    }
  }

  return NextResponse.json({
    ok: true,
    total: pages.length,
    cleaned,
    skipped,
    results,
  });
}
