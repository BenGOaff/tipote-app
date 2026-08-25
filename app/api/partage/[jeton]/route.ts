// app/api/partage/[jeton]/route.ts
//
// LE CÔTÉ DESTINATAIRE D'UN LIEN DE PARTAGE.
//
//   GET  -> ce que le lien contient, sans compte, sans rien installer
//   POST -> installer la copie dans le compte de la personne connectée
//
// -- POURQUOI LA CLÉ DE SERVICE ICI, ET NULLE PART AILLEURS ------------
//
// Celui qui reçoit le lien n'a AUCUN droit sur ce quiz : la RLS lui
// répondrait "introuvable", et c'est très bien ainsi. Le serveur lit
// donc le quiz source avec la clé de service, mais il n'ÉCRIT rien avec
// elle : la copie est insérée avec la session de la personne, donc sous
// sa propre RLS, avec son `user_id` et son projet. Une écriture faite
// avec la clé de service serait une écriture que la base ne vérifie
// plus, et c'est exactement ce qu'on ne veut pas d'une route ouverte.
//
// -- LE QUIZ D'ORIGINE N'EST JAMAIS TOUCHÉ ----------------------------
//
// On ne modifie que `quiz_shares.installs_count`. Aucune ligne du quiz
// partagé n'est lue en écriture, aucun compteur du quiz d'origine ne
// bouge, et il n'est ni publié ni dépublié.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isPaidPlan, FREE_LIMITS } from "@/lib/planLimits";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  aPersonnaliser,
  etatPartage,
  jetonValide,
  nettoyerPourPartage,
  QUESTION_COLONNES_PRIVEES,
  QUIZ_COLONNES_PRIVEES,
  RESULT_COLONNES_PRIVEES,
} from "@/lib/quiz/partage";
import {
  cheminPourInstallateur,
  collecterImages,
  reecrireImages,
} from "@/lib/quiz/partageImages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ jeton: string }> };

type Partage = {
  id: string;
  quiz_id: string;
  enabled: boolean | null;
  expires_at: string | null;
  max_installs: number | null;
  installs_count: number | null;
};

/** Lit la ligne de partage et le quiz derrière, sans rien décider. */
async function lireLePartage(jeton: string): Promise<{
  partage: Partage | null;
  quiz: Record<string, unknown> | null;
  panne: boolean;
}> {
  const { data, error } = await supabaseAdmin
    .from("quiz_shares")
    .select("id, quiz_id, enabled, expires_at, max_installs, installs_count")
    .eq("token", jeton)
    .maybeSingle();

  if (error) {
    // "Je n'ai pas pu regarder" et "il n'y a rien" n'appellent pas la
    // même suite : le premier est une panne de notre côté, et dire
    // "lien inconnu" enverrait la personne demander un nouveau lien
    // parfaitement valide.
    console.error(`[partage] lecture impossible : ${error.message}`);
    return { partage: null, quiz: null, panne: true };
  }
  if (!data) return { partage: null, quiz: null, panne: false };

  const partage = data as Partage;
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("*")
    .eq("id", partage.quiz_id)
    .maybeSingle();

  return { partage, quiz: (quiz as Record<string, unknown>) ?? null, panne: false };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { jeton: brut } = await context.params;
  const jeton = jetonValide(brut);
  if (!jeton) {
    return NextResponse.json({ ok: false, raison: "inconnu" }, { status: 404 });
  }

  const { partage, quiz, panne } = await lireLePartage(jeton);
  if (panne) {
    return NextResponse.json({ ok: false, raison: "panne" }, { status: 502 });
  }
  const etat = etatPartage(partage, new Date());
  if (!etat.ouvert) {
    return NextResponse.json({ ok: false, raison: etat.raison }, { status: 410 });
  }
  if (!quiz) {
    // Le quiz a été supprimé depuis l'envoi du lien. La cascade retire
    // la ligne de partage, mais on peut arriver ici entre les deux.
    return NextResponse.json({ ok: false, raison: "inconnu" }, { status: 404 });
  }

  const [{ count: nbQuestions }, { data: resultats }] = await Promise.all([
    supabaseAdmin
      .from("quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quiz.id as string),
    supabaseAdmin.from("quiz_results").select("*").eq("quiz_id", quiz.id as string),
  ]);

  // L'aperçu ne montre que ce qui est déjà PUBLIC sur un quiz en ligne :
  // son titre, son sous-titre, son image. Rien des tags, des clés ou des
  // destinations, que la copie ne recevra de toute façon pas.
  return NextResponse.json({
    ok: true,
    apercu: {
      titre: quiz.title ?? "",
      sous_titre: quiz.intro_text ?? quiz.subtitle ?? null,
      mode: quiz.mode ?? "quiz",
      // La langue DU QUIZ : c'est elle qui habille la page du
      // destinataire. Le contenu ne change jamais de langue, c'est
      // notre emballage autour qui suit (lib/quiz/partageTextes.ts).
      langue: quiz.locale ?? null,
      image: quiz.cover_image_url ?? quiz.intro_image_url ?? null,
      couleur: quiz.primary_color ?? null,
      nb_questions: nbQuestions ?? 0,
      nb_resultats: (resultats ?? []).length,
      a_personnaliser: aPersonnaliser({
        quiz,
        resultats: (resultats ?? []) as Record<string, unknown>[],
      }),
    },
  });
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const { jeton: brut } = await context.params;
  const jeton = jetonValide(brut);
  if (!jeton) {
    return NextResponse.json({ ok: false, raison: "inconnu" }, { status: 404 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, raison: "non_connecte" }, { status: 401 });
  }

  const { partage, quiz, panne } = await lireLePartage(jeton);
  if (panne) {
    return NextResponse.json({ ok: false, raison: "panne" }, { status: 502 });
  }
  const etat = etatPartage(partage, new Date());
  if (!etat.ouvert) {
    return NextResponse.json({ ok: false, raison: etat.raison }, { status: 410 });
  }
  if (!quiz || !partage) {
    return NextResponse.json({ ok: false, raison: "inconnu" }, { status: 404 });
  }

  const mode =
    quiz.mode === "survey" ? "survey" : quiz.mode === "scoring" ? "scoring" : "quiz";

  // Le projet actif, comme la duplication : côté Tipote un contenu
  // appartient à un projet, et une copie qui atterrirait hors projet
  // serait invisible dans l'écran où on vient de la créer.
  const projectId = await getActiveProjectId(supabase, user.id);

  // Le plafond du plan gratuit s'applique ici comme partout : installer
  // un quiz partagé est une création de plus, pas une porte dérobée.
  // `profiles` est clé sur `id` chez Tipote (sur `user_id` chez Tiquiz) :
  // recopier la requête du jumeau donnerait zéro ligne, donc un plan lu
  // comme gratuit pour tout le monde.
  const { data: profil } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  if (!isPaidPlan((profil as { plan?: string | null } | null)?.plan)) {
    let requete = supabase
      .from("quizzes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("mode", mode);
    if (projectId) requete = requete.eq("project_id", projectId);
    const { count } = await requete;
    const plafond = mode === "survey" ? FREE_LIMITS.maxSurveys : FREE_LIMITS.maxQuizzes;
    if ((count ?? 0) >= plafond) {
      return NextResponse.json(
        { ok: false, raison: mode === "survey" ? "limite_sondage" : "limite_quiz" },
        { status: 403 },
      );
    }
  }

  const [questionsRes, resultatsRes] = await Promise.all([
    supabaseAdmin
      .from("quiz_questions")
      .select("*")
      .eq("quiz_id", quiz.id as string)
      .order("sort_order")
      .order("id"),
    supabaseAdmin
      .from("quiz_results")
      .select("*")
      .eq("quiz_id", quiz.id as string)
      .order("sort_order"),
  ]);
  if (questionsRes.error || resultatsRes.error) {
    console.error(
      `[partage] enfants illisibles : ${questionsRes.error?.message ?? resultatsRes.error?.message}`,
    );
    return NextResponse.json({ ok: false, raison: "panne" }, { status: 502 });
  }

  const questions = (questionsRes.data ?? []) as Record<string, unknown>[];
  const resultats = (resultatsRes.data ?? []) as Record<string, unknown>[];
  const aFaire = aPersonnaliser({ quiz, resultats });

  // -- LES IMAGES ------------------------------------------------------
  // On recopie chaque fichier de NOTRE bucket dans le dossier du nouveau
  // propriétaire. Sans ça, un ménage dans le stockage de l'expéditeur
  // viderait le quiz de son client des mois plus tard.
  const chemins = new Set<string>();
  collecterImages(quiz, chemins);
  collecterImages(questions, chemins);
  collecterImages(resultats, chemins);

  const marque = randomUUID().replace(/-/g, "").slice(0, 8);
  const correspondance = new Map<string, string>();
  let imagesRatees = 0;
  for (const source of chemins) {
    const bouts = source.split("/");
    const fichier = bouts[bouts.length - 1];
    const destination = cheminPourInstallateur(
      [...bouts.slice(0, -1), `partage-${marque}-${fichier}`].join("/"),
      user.id,
    );
    if (!destination) {
      imagesRatees += 1;
      continue;
    }
    const { error } = await supabase.storage
      .from("public-assets")
      .copy(source, destination);
    if (error) {
      // Repli VOULU : on garde l'URL d'origine. Le bucket est en lecture
      // publique, donc l'image s'affiche encore ; un carré vide serait
      // pire. Et l'écran dit combien de fichiers n'ont pas suivi.
      console.error(`[partage] copie image ratee (${source}) : ${error.message}`);
      imagesRatees += 1;
      continue;
    }
    correspondance.set(source, destination);
  }

  // -- LA COPIE --------------------------------------------------------
  const ligneQuiz = {
    ...reecrireImages(nettoyerPourPartage(quiz, QUIZ_COLONNES_PRIVEES), correspondance),
    user_id: user.id,
    project_id: projectId,
    // Le slug n'est pas repris : deux quiz ne peuvent pas porter la même
    // adresse publique, et celle de l'expéditeur est déjà en ligne.
    slug: null,
    // Brouillon, toujours. Publier à sa place le mettrait en ligne avec
    // les champs qu'on vient justement de vider.
    status: "draft",
    views_count: 0,
    starts_count: 0,
    completions_count: 0,
    shares_count: 0,
  };

  const { data: cree, error: errQuiz } = await supabase
    .from("quizzes")
    .insert(ligneQuiz)
    .select("id")
    .single();
  if (errQuiz || !cree) {
    console.error(`[partage] insertion impossible : ${errQuiz?.message}`);
    return NextResponse.json({ ok: false, raison: "installation_impossible" }, { status: 502 });
  }
  const nouveauId = (cree as { id: string }).id;

  const enfants: Array<[string, Record<string, unknown>[], Set<string>]> = [
    ["quiz_questions", questions, QUESTION_COLONNES_PRIVEES],
    ["quiz_results", resultats, RESULT_COLONNES_PRIVEES],
  ];
  for (const [table, lignes, privees] of enfants) {
    if (lignes.length === 0) continue;
    const { error } = await supabase.from(table).insert(
      lignes.map((l) => ({
        ...reecrireImages(nettoyerPourPartage(l, privees), correspondance),
        quiz_id: nouveauId,
      })),
    );
    if (error) {
      // Une moitié de quiz est pire que pas de quiz : on retire la copie
      // (la cascade emporte ce qui a déjà été inséré).
      await supabase.from("quizzes").delete().eq("id", nouveauId);
      console.error(`[partage] enfants non copies (${table}) : ${error.message}`);
      return NextResponse.json(
        { ok: false, raison: "installation_impossible" },
        { status: 502 },
      );
    }
  }

  // Le compteur est incrémenté APRÈS l'installation : un essai qui
  // échoue ne doit pas consommer le lien de quelqu'un.
  await supabaseAdmin
    .from("quiz_shares")
    .update({
      installs_count: Number(partage.installs_count ?? 0) + 1,
      last_install_at: new Date().toISOString(),
    })
    .eq("id", partage.id);

  return NextResponse.json({
    ok: true,
    id: nouveauId,
    mode,
    a_personnaliser: aFaire,
    images_ratees: imagesRatees,
  });
}
