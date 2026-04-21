// app/quiz/new/page.tsx
// Instant-create: POST an empty quiz (3 empty questions + 3 empty results
// mirroring the Tiquiz starter template) then redirect straight into the
// WYSIWYG editor at /quiz/{id}. No linear-form detour.
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

export default async function NewQuizPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const projectId = await getActiveProjectId(supabase, user.id);

  // Pull defaults from business_profiles (address_form drives consent wording).
  let bpQuery = supabase
    .from("business_profiles")
    .select("privacy_url, address_form")
    .eq("user_id", user.id);
  if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
  const { data: bp } = await bpQuery.maybeSingle();

  const addressForm = ((bp as { address_form?: string } | null)?.address_form ?? "tu") === "vous" ? "vous" : "tu";
  const defaultConsent = addressForm === "vous"
    ? "En renseignant votre email, vous acceptez notre politique de confidentialité."
    : "En renseignant ton email, tu acceptes notre politique de confidentialité.";

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      user_id: user.id,
      ...(projectId ? { project_id: projectId } : {}),
      title: "Mon quiz",
      introduction: "",
      consent_text: defaultConsent,
      privacy_url: (bp as { privacy_url?: string } | null)?.privacy_url ?? null,
      status: "draft",
      locale: "fr",
    })
    .select("id")
    .single();

  if (error || !quiz) {
    console.error("[quiz/new] Failed to insert empty quiz:", error?.message);
    redirect("/?quiz_create_error=1");
  }

  // Starter template: 3 empty questions with 4 options each, 3 empty results.
  const emptyOptions = [0, 1, 2, 0].map((result_index) => ({ text: "", result_index }));
  await Promise.all([
    supabase.from("quiz_questions").insert(
      [0, 1, 2].map((i) => ({
        quiz_id: quiz.id,
        question_text: "",
        options: emptyOptions,
        sort_order: i,
      })),
    ),
    supabase.from("quiz_results").insert(
      [0, 1, 2].map((i) => ({
        quiz_id: quiz.id,
        title: `Résultat ${i + 1}`,
        description: "",
        sort_order: i,
      })),
    ),
  ]);

  redirect(`/quiz/${quiz.id}`);
}
