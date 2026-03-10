// app/api/admin/support/route.ts
// Admin CRUD for support categories and articles
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";

async function assertAdmin() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.user?.id && isAdminEmail(session?.user?.email);
}

// GET — list all categories + all articles (including unpublished)
export async function GET(req: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "categories";

  if (type === "articles") {
    const categoryId = url.searchParams.get("category_id");
    let query = supabaseAdmin
      .from("support_articles")
      .select("*, support_categories(slug, title, icon)")
      .order("sort_order");

    if (categoryId) query = query.eq("category_id", categoryId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, articles: data });
  }

  const { data, error } = await supabaseAdmin
    .from("support_categories")
    .select("*")
    .order("sort_order");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, categories: data });
}

// POST — create category or article
export async function POST(req: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { type, ...payload } = body;

  if (type === "category") {
    const { data, error } = await supabaseAdmin
      .from("support_categories")
      .insert(payload)
      .select()
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, category: data });
  }

  if (type === "article") {
    const { data, error } = await supabaseAdmin
      .from("support_articles")
      .insert(payload)
      .select()
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, article: data });
  }

  return NextResponse.json({ ok: false, error: "Invalid type" }, { status: 400 });
}

// PATCH — update category or article
export async function PATCH(req: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { type, id, ...updates } = body;

  const table = type === "category" ? "support_categories" : "support_articles";
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

// DELETE — delete category or article
export async function DELETE(req: NextRequest) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "article";
  const id = url.searchParams.get("id");

  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const table = type === "category" ? "support_categories" : "support_articles";
  const { error } = await supabaseAdmin.from(table).delete().eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
