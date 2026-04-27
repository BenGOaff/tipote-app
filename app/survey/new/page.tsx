// app/survey/new/page.tsx
// Survey creation entry point. Mirrors /quiz/new (3 tabs: Manual / AI /
// Import) but routes to the survey AI prompt + saves with mode='survey'
// so the existing editor + public renderer pick up from there.
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import SurveyFormClient from "@/components/quiz/SurveyFormClient";

export const metadata = { title: "Nouveau sondage – Tipote" };

export default async function NewSurveyPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) redirect("/");

  return <SurveyFormClient />;
}
