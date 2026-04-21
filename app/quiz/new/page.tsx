// app/quiz/new/page.tsx
// Tiquiz-parity: create page with 3 tabs (Manual / AI chat / Import).
// The AI tab hosts the "Pas d'idée ?" brainstorming chat. On save, the
// form redirects to /quiz/{id} (the visual WYSIWYG editor).
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
