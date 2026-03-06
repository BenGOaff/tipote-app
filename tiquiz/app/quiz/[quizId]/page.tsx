// app/quiz/[quizId]/page.tsx — Authenticated quiz editor page
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import QuizDetailClient from "@/components/quiz/QuizDetailClient";

type Props = { params: Promise<{ quizId: string }> };

export default async function QuizEditorPage({ params }: Props) {
  const { quizId } = await params;

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <QuizDetailClient quizId={quizId} />;
}
