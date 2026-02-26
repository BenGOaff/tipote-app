// app/q/[quizId]/page.tsx
// Public quiz page (no auth required)
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import PublicQuizClient from "@/components/quiz/PublicQuizClient";

type RouteContext = { params: Promise<{ quizId: string }> };

export async function generateMetadata({ params }: RouteContext): Promise<Metadata> {
  const { quizId } = await params;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return {};

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
      .from("quizzes")
      .select("title, introduction, og_image_url")
      .eq("id", quizId)
      .eq("status", "active")
      .maybeSingle();

    if (!data) return {};

    const meta: Metadata = {
      title: data.title,
      description: data.introduction?.slice(0, 160) || undefined,
      openGraph: {
        title: data.title,
        description: data.introduction?.slice(0, 160) || undefined,
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
