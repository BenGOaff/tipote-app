// app/q/[quizId]/page.tsx — Public quiz page (no auth required)
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import PublicQuizClient from "@/components/quiz/PublicQuizClient";

type Props = { params: Promise<{ quizId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { quizId } = await params;

  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("title, introduction, og_image_url")
    .eq("id", quizId)
    .eq("status", "active")
    .maybeSingle();

  if (!quiz) {
    return { title: "Quiz introuvable | Tiquiz" };
  }

  return {
    title: `${quiz.title} | Tiquiz`,
    description: quiz.introduction ?? "Fais le quiz et decouvre ton profil !",
    openGraph: {
      title: quiz.title,
      description: quiz.introduction ?? "Fais le quiz et decouvre ton profil !",
      ...(quiz.og_image_url ? { images: [{ url: quiz.og_image_url }] } : {}),
    },
  };
}

export default async function PublicQuizPage({ params }: Props) {
  const { quizId } = await params;

  return <PublicQuizClient quizId={quizId} />;
}
