// lib/generateurs/briefQuiz.ts
//
// CE QUE LE QUIZ SAIT DÉJÀ, ET QU'ON NE REDEMANDE JAMAIS.
//
// -- LA LEÇON DE L'ATELIER, REPRISE TELLE QUELLE ----------------------
//
// Béné, 5 août 2026, après le premier vrai test du générateur de bonus :
// "on ne réutilise pas assez les données du quiz : pourquoi ne pas
// prendre le quiz suivi et récupérer toutes ces infos automatiquement ?"
//
// Elle avait raison, et le symptôme était pire qu'une saisie de trop :
// le formulaire demandait "mon audience" et "ma niche", deux champs que
// personne ne sait différencier, alors que le quiz porte déjà le thème,
// le ton, les profils et leurs descriptions. Un formulaire qui redemande
// ce qu'on sait produit des réponses vagues, donc un contenu vague.
//
// **Il ne reste à saisir que ce que le quiz ne PEUT pas savoir : l'OFFRE
// payante.**
//
// -- ET LE BRIEF EST CONSTRUIT CÔTÉ SERVEUR ---------------------------
//
// Il ne transite jamais par le client. Sans ça, n'importe qui pourrait
// annoncer un autre quiz que le sien et faire écrire un contenu sur des
// profils qui ne lui appartiennent pas. C'est aussi ce qui garantit que
// deux générateurs lancés sur le même quiz partent des mêmes faits.
//
// -- LE TITRE D'UN PROFIL EST DU TEXTE RICHE --------------------------
//
// Il porte des balises et des variables. `resultChoiceLabel` le nettoie,
// et c'est la règle du 1er septembre (retour Christian). L'oublier ici
// enverrait `<div class="rt-field-fs" ...>` dans le prompt : le modèle
// écrirait alors du contenu autour de nos balises.

import { resultChoiceLabel } from "@/lib/quiz/resultLabel";
import { interpolateText } from "@/lib/quizPersonalization";
import { stripHtml } from "@/lib/richText";

/** Un profil de résultat, réduit à ce que les générateurs exploitent. */
export interface ProfilBrief {
  /** Son rang, 1-based. L'écran nomme un profil sans titre avec. */
  rang: number;
  titre: string;
  description: string;
  /** Le tag Systeme.io de ce profil, quand il en a un. */
  tag: string;
}

/**
 * Le brief d'un quiz, tel que les trois générateurs le reçoivent.
 *
 * TOUT vient de la base. Rien de ce qui est ici n'est saisi.
 */
export interface BriefQuiz {
  titre: string;
  /** L'intro de l'écran d'accueil : la promesse faite au visiteur. */
  intro: string;
  /** "tu" ou "vous". Le contenu généré doit parler comme le quiz. */
  adresse: "tu" | "vous";
  /** La langue du quiz, pour que le contenu sorte dans la sienne. */
  langue: string;
  profils: ProfilBrief[];
  /** Le tag de partage, quand la créatrice en a posé un. */
  tagPartage: string;
  /** L'adresse publique du quiz, pour les contenus de promotion. */
  urlPublique: string;
  /** Le bonus déjà promis à l'étape de partage, s'il existe. */
  bonusExistant: string;
  /** Combien de questions : sert à annoncer une durée honnête. */
  nbQuestions: number;
}

/** Le texte riche d'un champ, rendu lisible pour un prompt. */
function texte(v: unknown): string {
  return stripHtml(interpolateText(String(v ?? ""), { name: "", gender: "x" })).trim();
}

/** La ligne `quizzes` telle qu'elle sort d'un `select`. */
export interface LigneQuizPourBrief {
  title?: string | null;
  introduction?: string | null;
  address_form?: string | null;
  locale?: string | null;
  slug?: string | null;
  id?: string | null;
  sio_share_tag_name?: string | null;
  bonus_description?: string | null;
}

export interface LigneResultatPourBrief {
  title?: string | null;
  description?: string | null;
  sio_tag_name?: string | null;
  sio_tag_names?: string[] | null;
}

/**
 * Construit le brief.
 *
 * `urlPublique` est passée par l'appelant : elle dépend du domaine
 * (domaine perso d'une créatrice, ou le nôtre), et cette décision vit
 * déjà dans `buildPublicUrl`. La recalculer ici donnerait deux adresses
 * pour le même quiz, et c'est celle du contenu généré qui serait
 * partagée (le défaut sorti six fois dans ce dépôt).
 *
 * `adresseParDefaut` vient du profil de la créatrice : la colonne du
 * quiz est NULLABLE et retombe dessus (migration 004).
 */
export function construireBriefQuiz(args: {
  quiz: LigneQuizPourBrief;
  resultats: LigneResultatPourBrief[];
  questions: unknown[];
  urlPublique: string;
  adresseParDefaut?: string | null;
}): BriefQuiz {
  const q = args.quiz;
  const adresseBrute = String(q.address_form ?? args.adresseParDefaut ?? "tu").trim();

  return {
    titre: texte(q.title),
    intro: texte(q.introduction),
    // Tout ce qui n'est pas explicitement "vous" est du tutoiement :
    // c'est le défaut de la colonne, et se tromper vers le "tu" est
    // moins grave que l'inverse dans l'univers de Béné.
    adresse: adresseBrute === "vous" ? "vous" : "tu",
    langue: String(q.locale ?? "fr").trim() || "fr",
    profils: args.resultats.map((r, i) => ({
      rang: i + 1,
      // `secours` VIDE, exprès : ce module ne traduit pas. Un profil
      // sans titre reste identifiable par son rang, et c'est le prompt
      // qui décide quoi en faire.
      titre: resultChoiceLabel(r.title, ""),
      description: texte(r.description),
      tag:
        (Array.isArray(r.sio_tag_names) ? r.sio_tag_names : [])
          .map((t) => String(t ?? "").trim())
          .find(Boolean) ?? String(r.sio_tag_name ?? "").trim(),
    })),
    tagPartage: String(q.sio_share_tag_name ?? "").trim(),
    urlPublique: args.urlPublique,
    bonusExistant: texte(q.bonus_description),
    nbQuestions: Array.isArray(args.questions) ? args.questions.length : 0,
  };
}

/**
 * Le brief, écrit pour un prompt.
 *
 * PURE et testée : c'est ce texte là que le modèle lit, et une
 * régression dedans ne se voit que dans la qualité de la sortie, c'est
 * à dire trop tard (leçon du 3 août, "un prompt est du CODE").
 *
 * Un champ VIDE est OMIS, jamais rendu avec un tiret : une ligne
 * "BONUS ACTUEL : -" apprend au modèle qu'il a le droit d'inventer.
 */
export function rendreBriefPourPrompt(b: BriefQuiz): string {
  const l: string[] = [];
  l.push(`TITRE DU QUIZ : ${b.titre || "(sans titre)"}`);
  if (b.intro) l.push(`CE QU'IL PROMET AU VISITEUR : ${b.intro}`);
  l.push(`NOMBRE DE QUESTIONS : ${b.nbQuestions}`);
  l.push(
    b.adresse === "vous"
      ? "TON : vouvoiement. Tu vouvoies le lecteur, sans exception."
      : "TON : tutoiement. Tu tutoies le lecteur, sans exception.",
  );
  if (b.bonusExistant) l.push(`BONUS DEJA PROMIS PAR LA CREATRICE : ${b.bonusExistant}`);
  if (b.profils.length > 0) {
    l.push("");
    l.push("LES PROFILS DE RESULTAT, DANS L'ORDRE :");
    for (const p of b.profils) {
      const nom = p.titre || `Profil ${p.rang}`;
      l.push(p.description ? `${p.rang}. ${nom} : ${p.description}` : `${p.rang}. ${nom}`);
    }
  }
  return l.join("\n");
}
