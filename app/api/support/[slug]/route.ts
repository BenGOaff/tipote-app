// app/api/support/[slug]/route.ts
// Public API — get a single article by slug, with related articles
// Falls back to static seed data when DB tables are empty or missing
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getStaticArticle } from "@/lib/support/staticFallback";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const { data: article, error } = await supabaseAdmin
      .from("support_articles")
      .select("*, support_categories(slug, title, icon)")
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (error) throw error;

    // Fallback to static seed data
    if (!article) {
      const staticResult = getStaticArticle(slug);
      if (!staticResult) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, ...staticResult });
    }

    // Fetch related articles
    let related: any[] = [];
    if (article.related_slugs?.length) {
      const { data: rel } = await supabaseAdmin
        .from("support_articles")
        .select("id, slug, title, category_id, support_categories(slug, title, icon)")
        .in("slug", article.related_slugs)
        .eq("published", true);
      related = rel ?? [];
    }

    // Fetch other articles in same category (for "next" navigation)
    const { data: siblings } = await supabaseAdmin
      .from("support_articles")
      .select("id, slug, title, sort_order")
      .eq("category_id", article.category_id)
      .eq("published", true)
      .order("sort_order");

    return NextResponse.json({ ok: true, article, related, siblings: siblings ?? [] });
  } catch (err: any) {
    // If tables don't exist, try static fallback
    const staticResult = getStaticArticle(slug);
    if (staticResult) {
      return NextResponse.json({ ok: true, ...staticResult });
    }
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
