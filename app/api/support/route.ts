// app/api/support/route.ts
// Public API — list categories with article counts, or search articles
// Falls back to static seed data when DB tables are empty or missing
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getStaticCategories,
  searchStaticArticles,
} from "@/lib/support/staticFallback";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const locale = url.searchParams.get("locale") ?? "fr";

  try {
    if (q) {
      // Full-text search across titles and content in the given locale
      const { data: articles, error } = await supabaseAdmin
        .from("support_articles")
        .select("id, slug, title, content, tags, category_id, sort_order, support_categories(slug, title, icon)")
        .eq("published", true)
        .order("sort_order");

      if (error) throw error;

      // Fallback to static data if DB is empty
      if (!articles || articles.length === 0) {
        return NextResponse.json({ ok: true, articles: searchStaticArticles(q, locale) });
      }

      const lower = q.toLowerCase();
      const filtered = (articles ?? []).filter((a: any) => {
        const t = (a.title?.[locale] ?? a.title?.fr ?? "").toLowerCase();
        const c = (a.content?.[locale] ?? a.content?.fr ?? "").toLowerCase();
        const tagMatch = (a.tags ?? []).some((tag: string) => tag.toLowerCase().includes(lower));
        return t.includes(lower) || c.includes(lower) || tagMatch;
      });

      return NextResponse.json({ ok: true, articles: filtered });
    }

    // List categories with their articles
    const { data: categories, error: catErr } = await supabaseAdmin
      .from("support_categories")
      .select("id, slug, icon, title, description, sort_order")
      .order("sort_order");

    if (catErr) throw catErr;

    // Fallback to static data if DB is empty
    if (!categories || categories.length === 0) {
      return NextResponse.json({ ok: true, categories: getStaticCategories() });
    }

    const { data: articles, error: artErr } = await supabaseAdmin
      .from("support_articles")
      .select("id, slug, title, category_id, sort_order, tags")
      .eq("published", true)
      .order("sort_order");

    if (artErr) throw artErr;

    // Group articles by category
    const result = (categories ?? []).map((cat: any) => ({
      ...cat,
      articles: (articles ?? []).filter((a: any) => a.category_id === cat.id),
    }));

    return NextResponse.json({ ok: true, categories: result });
  } catch (err: any) {
    // If tables don't exist at all, serve static data
    return NextResponse.json({ ok: true, categories: getStaticCategories() });
  }
}
