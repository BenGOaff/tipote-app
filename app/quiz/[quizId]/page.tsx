// app/quiz/[quizId]/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import QuizDetailClient from "@/components/quiz/QuizDetailClient";

type RouteContext = { params: Promise<{ quizId: string }> };

export default async function QuizDetailPage({ params }: RouteContext) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  const { quizId } = await params;

  return <QuizDetailClient quizId={quizId} />;
}
