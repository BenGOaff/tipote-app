// app/quiz/new/page.tsx
// Create-a-quiz page (tabbed: Manual / AI / Import), powered by QuizFormClient.
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import QuizFormClient from "@/components/quiz/QuizFormClient";

export const metadata = { title: "Nouveau quiz – Tipote" };

export default async function NewQuizPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) redirect("/");

  return <QuizFormClient />;
}
