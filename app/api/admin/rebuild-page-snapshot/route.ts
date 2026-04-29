// app/api/admin/rebuild-page-snapshot/route.ts
// Admin-only one-shot: rebuild a single hosted_page's html_snapshot
// from its current content_data + brand_tokens + layout_config +
// section_order. Useful when:
//   - A historical bug (e.g. the section_order={} wipe of 2026-04-29)
//     left a row with stale html_snapshot that no longer reflects the
//     correct DB state, even after the column itself was repaired.
//   - A renderer change (e.g. baking section_order CSS into the
//     snapshot) needs to be applied retroactively to existing pages
//     without requiring each user to open the editor and trigger a
//     save.
//
// Auth: standard admin gate (lib/adminEmails). The endpoint is
// idempotent — calling it twice produces identical snapshots — but
// each call still snapshots the OLD state via hosted_pages_history,
// so a botched rebuild can always be rolled back.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";
import { buildPage } from "@/lib/pageBuilder";
import { applySectionOrderToHtml } from "@/lib/pages/applySectionOrderToHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // ── Input ─────────────────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* keep empty */ }
  const pageId = String(body.pageId ?? "").trim();
  if (!pageId) {
    return NextResponse.json({ ok: false, error: "pageId required" }, { status: 400 });
  }

  // ── Load current state ────────────────────────────────────────
  const { data: row, error } = await supabaseAdmin
    .from("hosted_pages")
    .select("id, user_id, page_type, template_kind, template_id, content_data, brand_tokens, layout_config, section_order, locale")
    .eq("id", pageId)
    .single();

  if (error || !row) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Page not found" },
      { status: 404 },
    );
  }

  // Linkinbio has its own renderer (no buildPage) — out of scope here.
  if ((row as { page_type: string }).page_type === "linkinbio") {
    return NextResponse.json(
      { ok: false, error: "Use buildLinkinbioPage for linkinbio pages." },
      { status: 400 },
    );
  }

  // ── Rebuild ───────────────────────────────────────────────────
  const r = row as {
    template_kind: string;
    content_data: Record<string, unknown> | null;
    brand_tokens: Record<string, unknown> | null;
    layout_config: Record<string, unknown> | null;
    section_order: { mobile?: string[]; desktop?: string[] } | null;
    locale: string | null;
  };
  const pageType: "capture" | "sales" | "showcase" =
    r.template_kind === "vente" ? "sales" :
    r.template_kind === "vitrine" ? "showcase" :
    "capture";

  let rawHtml: string;
  try {
    rawHtml = buildPage({
      pageType,
      contentData: r.content_data ?? {},
      brandTokens: r.brand_tokens ?? null,
      locale: r.locale ?? "fr",
      layoutConfig: r.layout_config ?? null,
    });
  } catch (buildErr) {
    console.error("[admin/rebuild-page-snapshot] buildPage failed:", pageId, buildErr);
    return NextResponse.json(
      { ok: false, error: "Renderer failed", detail: String(buildErr) },
      { status: 500 },
    );
  }

  const nextHtml = applySectionOrderToHtml(rawHtml, r.section_order ?? null);

  // ── Persist ───────────────────────────────────────────────────
  const { error: updErr } = await supabaseAdmin
    .from("hosted_pages")
    .update({
      html_snapshot: nextHtml,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId);

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    pageId,
    html_bytes: nextHtml.length,
    section_order_applied: !!r.section_order && (
      Array.isArray(r.section_order.mobile) && r.section_order.mobile.length > 0 ||
      Array.isArray(r.section_order.desktop) && r.section_order.desktop.length > 0
    ),
  });
}
