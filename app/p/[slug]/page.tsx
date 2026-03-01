// app/p/[slug]/page.tsx
// Public hosted page (no auth required) — like /q/[quizId] for quizzes.
// Uses fresh Supabase client per request (same pattern as the working quiz route).

import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import PublicPageClient from "@/components/pages/PublicPageClient";

// Force dynamic rendering so published pages are always fresh (never cached as "not found").
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

const PAGE_SELECT =
  "id, title, slug, page_type, html_snapshot, meta_title, meta_description, og_image_url, capture_enabled, capture_heading, capture_subtitle, capture_first_name, payment_url, payment_button_text, video_embed_url, legal_mentions_url, legal_cgv_url, legal_privacy_url, status";

/** Create a fresh Supabase client for each request (like the quiz route). */
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getPage(slug: string) {
  const supabase = getSupabase();
  if (!supabase) {
    console.error("[public-page] Missing Supabase env vars");
    return null;
  }

  const { data, error } = await supabase
    .from("hosted_pages")
    .select(PAGE_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[public-page] Supabase error for slug:", slug, error.message, error.code);
  }
  if (!data) {
    console.error("[public-page] No published page found for slug:", slug);
  }
  return data;
}

export async function generateMetadata({ params }: RouteContext): Promise<Metadata> {
  const { slug } = await params;

  try {
    const page = await getPage(slug);
    if (!page) return {};

    const meta: Metadata = {
      title: page.meta_title || page.title,
      description: page.meta_description || undefined,
      openGraph: {
        title: page.meta_title || page.title,
        description: page.meta_description || undefined,
        type: "website",
      },
    };

    if (page.og_image_url) {
      meta.openGraph!.images = [{ url: page.og_image_url, width: 1200, height: 630 }];
    }

    return meta;
  } catch {
    return {};
  }
}

export default async function PublicPage({ params }: RouteContext) {
  const { slug } = await params;

  let page: any = null;
  try {
    page = await getPage(slug);
  } catch (err) {
    console.error("[public-page] getPage threw:", err);
  }

  // Pass slug to client component — it will fetch client-side if server data is missing
  return <PublicPageClient page={page} slug={slug} />;
}
