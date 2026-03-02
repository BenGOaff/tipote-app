// app/api/testimonials/route.ts
// CRUD for reusable testimonials
// GET: list user's testimonials
// POST: create a new testimonial

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, testimonials: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const authorName = String(body?.author_name || "").trim();
  const content = String(body?.content || "").trim();

  if (!authorName || !content) {
    return NextResponse.json({ error: "Nom et contenu requis" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("testimonials")
    .insert({
      user_id: session.user.id,
      author_name: authorName,
      author_role: String(body?.author_role || "").trim(),
      author_photo_url: String(body?.author_photo_url || "").trim(),
      content,
      rating: Math.min(5, Math.max(1, parseInt(body?.rating) || 5)),
      source: String(body?.source || "manual").trim(),
      offer_id: String(body?.offer_id || "").trim(),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, testimonial: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requis" }, { status: 400 });
  }

  const { error } = await supabase
    .from("testimonials")
    .delete()
    .eq("id", id)
    .eq("user_id", session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
