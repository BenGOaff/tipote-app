// app/api/admin/support/seed/route.ts
// One-time seed endpoint — inserts all categories + articles
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";
import { SEED_CATEGORIES, SEED_ARTICLES } from "@/lib/support/seedData";

export async function POST(req: NextRequest) {
  // Admin check
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id || !isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    // 1) Upsert categories
    for (const cat of SEED_CATEGORIES) {
      const { error } = await supabaseAdmin
        .from("support_categories")
        .upsert(
          { slug: cat.slug, icon: cat.icon, sort_order: cat.sort_order, title: cat.title, description: cat.description },
          { onConflict: "slug" }
        );
      if (error) throw new Error(`Category ${cat.slug}: ${error.message}`);
    }

    // 2) Fetch category id map
    const { data: cats } = await supabaseAdmin
      .from("support_categories")
      .select("id, slug");
    const catMap = Object.fromEntries((cats ?? []).map((c: any) => [c.slug, c.id]));

    // 3) Upsert articles
    for (const art of SEED_ARTICLES) {
      const categoryId = catMap[art.category_slug];
      if (!categoryId) throw new Error(`Unknown category: ${art.category_slug}`);

      const { error } = await supabaseAdmin
        .from("support_articles")
        .upsert(
          {
            slug: art.slug,
            category_id: categoryId,
            sort_order: art.sort_order,
            title: art.title,
            content: art.content,
            related_slugs: art.related_slugs,
            tags: art.tags,
            published: true,
          },
          { onConflict: "slug" }
        );
      if (error) throw new Error(`Article ${art.slug}: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      categories: SEED_CATEGORIES.length,
      articles: SEED_ARTICLES.length,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
