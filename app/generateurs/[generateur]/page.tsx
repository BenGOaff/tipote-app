// app/generateurs/[generateur]/page.tsx
//
// L'ÉCRAN D'UN GÉNÉRATEUR : on choisit le projet, puis on écrit.
//
// -- LES PROJETS SONT CHARGÉS CÔTÉ SERVEUR ----------------------------
//
// Avec ce qu'il faut pour dire, projet par projet, si ce générateur peut
// tourner dessus (`blocageGenerateur`). Un sélecteur qui proposerait
// tout enverrait la créatrice se cogner à un écran qui ne peut rien
// produire, et elle en conclurait que l'outil est cassé.
//
// Les projets bloqués sont MONTRÉS, avec leur raison : les cacher
// laisserait chercher un quiz qui est pourtant là (règle du 22 août,
// "un bouton absent se justifie sur la ligne").

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getPlanLimits } from "@/lib/planLimits";
import { GENERATEURS, type GenerateurId } from "@/lib/generateurs/catalogue";
import { resultChoiceLabel } from "@/lib/quiz/resultLabel";
import { stripHtml } from "@/lib/richText";
import GenerateurClient, { type ProjetAffiche } from "./GenerateurClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("generators") };
}

export default async function GenerateurPage({
  params,
}: {
  params: Promise<{ generateur: string }>;
}) {
  const { generateur } = await params;
  if (!GENERATEURS.includes(generateur as GenerateurId)) notFound();
  const id = generateur as GenerateurId;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  const plan = (profil as { plan?: string | null } | null)?.plan ?? null;

  // Le même filtre par projet actif que la liste "Mes projets" : sans
  // lui, un side project remonterait ici alors qu'il est masqué là bas.
  const scope = await getActiveProjectId(supabase, user.id);
  let requete = supabaseAdmin
    .from("quizzes")
    .select("id, title, mode, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (scope) requete = requete.eq("project_id", scope);
  const { data: quiz } = await requete;

  const lignes = (quiz ?? []) as {
    id: string;
    title: string | null;
    mode: string | null;
    status: string | null;
  }[];
  const ids = lignes.map((q) => q.id);

  // Les profils et le nombre de questions, en deux requêtes pour tous
  // les projets. Une requête par projet ferait vingt allers-retours sur
  // un compte fourni.
  const [{ data: resultats }, { data: questions }] = ids.length
    ? await Promise.all([
        supabaseAdmin
          .from("quiz_results")
          .select("quiz_id, title, description")
          .in("quiz_id", ids)
          .order("sort_order")
          .order("id"),
        supabaseAdmin.from("quiz_questions").select("quiz_id").in("quiz_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const parQuiz = new Map<string, { titre: string; description: string }[]>();
  for (const r of (resultats ?? []) as {
    quiz_id: string;
    title: string | null;
    description: string | null;
  }[]) {
    const liste = parQuiz.get(r.quiz_id) ?? [];
    // Le titre d'un profil est du TEXTE RICHE : sans `resultChoiceLabel`
    // le sélecteur afficherait `<div class="rt-field-fs" ...>` (retour
    // Christian, 1er septembre). Le secours est vide : c'est l'écran
    // qui traduit "Profil 2".
    liste.push({
      titre: resultChoiceLabel(r.title, ""),
      description: stripHtml(String(r.description ?? "")).trim(),
    });
    parQuiz.set(r.quiz_id, liste);
  }

  const compteQuestions = new Map<string, number>();
  for (const q of (questions ?? []) as { quiz_id: string }[]) {
    compteQuestions.set(q.quiz_id, (compteQuestions.get(q.quiz_id) ?? 0) + 1);
  }

  const projets: ProjetAffiche[] = lignes.map((q) => ({
    id: q.id,
    titre: stripHtml(String(q.title ?? "")).trim(),
    mode: q.mode ?? "quiz",
    statut: q.status ?? "draft",
    nbQuestions: compteQuestions.get(q.id) ?? 0,
    profils: parQuiz.get(q.id) ?? [],
  }));

  return (
    <GenerateurClient
      userEmail={user.email ?? ""}
      generateur={id}
      projets={projets}
      autorise={getPlanLimits(plan).analyseStatistiques}
    />
  );
}
