// app/q/[quizId]/page.tsx
// Public quiz page (no auth required)
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import PublicQuizClient from "@/components/quiz/PublicQuizClient";
import { stripHtml } from "@/lib/richText";

// Force dynamic rendering so quiz metadata/status is always fresh.
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: RouteContext): Promise<Metadata> {
  const { quizId: param } = await params;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return {};

    const supabase = createClient(supabaseUrl, supabaseKey);
    const base = supabase
      .from("quizzes")
      .select("title, introduction, og_image_url, og_description")
      .eq("status", "active");
    const { data } = await (UUID_RE.test(param)
      ? base.eq("id", param).maybeSingle()
      : base.ilike("slug", param).maybeSingle());

    if (!data) return {};

    const description = (data.og_description?.trim() || stripHtml(data.introduction).slice(0, 160)) || undefined;

    const meta: Metadata = {
      title: data.title,
      description,
      openGraph: {
        title: data.title,
        description,
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

export default async function PublicQuizPage({ params }: RouteContext) {
  const { quizId } = await params;
  return <PublicQuizClient quizId={quizId} />;
}
