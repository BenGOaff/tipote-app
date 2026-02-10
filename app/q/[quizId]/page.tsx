// app/q/[quizId]/page.tsx
// Public quiz page (no auth required)
import PublicQuizClient from "@/components/quiz/PublicQuizClient";

type RouteContext = { params: Promise<{ quizId: string }> };

export default async function PublicQuizPage({ params }: RouteContext) {
  const { quizId } = await params;
  return <PublicQuizClient quizId={quizId} />;
}
