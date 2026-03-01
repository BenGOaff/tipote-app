// app/p/[slug]/page.tsx
// Public hosted page (no auth required) — like /q/[quizId] for quizzes.

import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import PublicPageClient from "@/components/pages/PublicPageClient";

type RouteContext = { params: Promise<{ slug: string }> };

async function getPage(slug: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase
    .from("hosted_pages")
    .select("id, title, slug, page_type, html_snapshot, meta_title, meta_description, og_image_url, capture_enabled, capture_heading, capture_subtitle, capture_first_name, payment_url, payment_button_text, video_embed_url, legal_mentions_url, legal_cgv_url, legal_privacy_url, status")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  return data;
}

export async function generateMetadata({ params }: RouteContext): Promise<Metadata> {
  const { slug } = await params;
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
}

export default async function PublicPage({ params }: RouteContext) {
  const { slug } = await params;
  const page = await getPage(slug);

  if (!page) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>Page introuvable</h1>
          <p style={{ color: "#666", marginTop: 8 }}>Cette page n'existe pas ou n'est plus disponible.</p>
        </div>
      </div>
    );
  }

  // Non-blocking: increment views
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      supabase.rpc("increment_page_views", { p_page_id: page.id }).then(() => {});
    }
  } catch { /* ignore */ }

  return <PublicPageClient page={page} />;
}
