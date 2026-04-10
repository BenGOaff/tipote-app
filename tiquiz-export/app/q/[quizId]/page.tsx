// app/q/[quizId]/page.tsx
// Public quiz page (no auth required)
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PublicQuizClient from "@/components/quiz/PublicQuizClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ quizId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { quizId } = await params;
  try {
    const { data } = await supabaseAdmin
      .from("quizzes")
      .select("title, introduction, og_image_url")
      .eq("id", quizId)
      .eq("status", "active")
      .maybeSingle();

    if (!data) return { title: "Quiz – Tiquiz" };

    return {
      title: `${data.title} – Tiquiz`,
      description: data.introduction?.slice(0, 160) ?? undefined,
      openGraph: {
        title: data.title,
        description: data.introduction?.slice(0, 160) ?? undefined,
        ...(data.og_image_url ? { images: [{ url: data.og_image_url }] } : {}),
      },
    };
  } catch {
    return { title: "Quiz – Tiquiz" };
  }
}

export default async function PublicQuizPage({ params }: Props) {
  const { quizId } = await params;
  return <PublicQuizClient quizId={quizId} />;
}
