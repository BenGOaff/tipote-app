// app/p/[slug]/page.tsx
// Public hosted page (no auth required) — like /q/[quizId] for quizzes.
// Server component fetches metadata for SEO, then delegates to PublicPageClient
// which fetches page data via the dedicated /api/pages/public/[slug] endpoint.

import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import PublicPageClient from "@/components/pages/PublicPageClient";

// Force dynamic rendering so published pages are always fresh.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/** Create a fresh Supabase client for metadata fetch. */
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function generateMetadata({ params }: RouteContext): Promise<Metadata> {
  const { slug } = await params;

  try {
    const supabase = getSupabase();
    if (!supabase) return {};

    const { data } = await supabase
      .from("hosted_pages")
      .select("title, meta_title, meta_description, og_image_url")
      .eq("slug", slug)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return {};

    const meta: Metadata = {
      title: data.meta_title || data.title,
      description: data.meta_description || undefined,
      openGraph: {
        title: data.meta_title || data.title,
        description: data.meta_description || undefined,
        type: "website",
      },
    };

    if (data.og_image_url) {
      meta.openGraph!.images = [{ url: data.og_image_url, width: 1200, height: 630 }];
    }

    return meta;
  } catch {
    return {};
  }
}

// Render: pass slug to client component which fetches via /api/pages/public/[slug]
// This matches the quiz pattern: server does metadata, client does data fetching.
export default async function PublicPage({ params }: RouteContext) {
  const { slug } = await params;
  return <PublicPageClient page={null} slug={slug} />;
}
