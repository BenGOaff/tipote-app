// app/quiz/new/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import QuizFormClient from "@/components/quiz/QuizFormClient";

export const metadata = { title: "Nouveau quiz – Tiquiz" };

export default async function NewQuizPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <QuizFormClient />;
}
