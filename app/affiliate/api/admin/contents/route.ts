// CRUD admin des contenus affiliés (gated isAdminEmail).
//   GET    ?kind=article            → liste (publiés ET brouillons)
//   POST   { kind, title, body, ... } → crée
//   PATCH  { id, ...champs }          → met à jour
//   DELETE ?id=...                    → supprime
//
// Service role (supabaseAdmin) après vérification admin. Aucune écriture
// possible sans email admin.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["article", "email", "post", "visual"] as const;
type Kind = (typeof KINDS)[number];

function forbidden() {
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  if (!(await getAffiliateAdmin())) return forbidden();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "article";
  const locale = url.searchParams.get("locale") ?? "fr";
  const { data, error } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, kind, locale, title, body, meta, sort_order, published, updated_at")
    .eq("kind", kind)
    .eq("locale", locale)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await getAffiliateAdmin())) return forbidden();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const kind = String(body.kind ?? "article") as Kind;
  if (!KINDS.includes(kind)) return NextResponse.json({ ok: false, error: "Bad kind" }, { status: 400 });
  const row = {
    kind,
    locale: typeof body.locale === "string" ? body.locale : "fr",
    title: typeof body.title === "string" ? body.title.slice(0, 300) : null,
    body: typeof body.body === "string" ? body.body.slice(0, 40000) : null,
    meta: typeof body.meta === "object" && body.meta ? body.meta : {},
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    published: body.published !== false,
  };
  const { data, error } = await supabaseAdmin.from("affiliate_contents").insert(row).select("id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req: NextRequest) {
  if (!(await getAffiliateAdmin())) return forbidden();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title.slice(0, 300);
  if (typeof body.body === "string") patch.body = body.body.slice(0, 40000);
  if (typeof body.meta === "object" && body.meta) patch.meta = body.meta;
  if (Number.isFinite(Number(body.sort_order))) patch.sort_order = Number(body.sort_order);
  if (typeof body.published === "boolean") patch.published = body.published;
  const { error } = await supabaseAdmin.from("affiliate_contents").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await getAffiliateAdmin())) return forbidden();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  const { error } = await supabaseAdmin.from("affiliate_contents").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
