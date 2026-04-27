// app/quiz/[quizId]/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import QuizDetailClient from "@/components/quiz/QuizDetailClient";
import SurveyDetailClient from "@/components/quiz/SurveyDetailClient";

type RouteContext = { params: Promise<{ quizId: string }> };

export default async function QuizDetailPage({ params }: RouteContext) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  const { quizId } = await params;

  // Same /quiz/[id] route serves quizzes and surveys (they share the
  // `quizzes` table). We branch server-side on mode so the client bundles
  // stay separated — survey UX has no result profiles, no virality / bonus,
  // and a Tendances analytics tab the quiz editor doesn't need.
  const { data: row } = await supabase
    .from("quizzes")
    .select("mode")
    .eq("id", quizId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  const mode = (row as { mode?: string } | null)?.mode;
  if (mode === "survey") {
    return <SurveyDetailClient quizId={quizId} />;
  }
  return <QuizDetailClient quizId={quizId} />;
}
