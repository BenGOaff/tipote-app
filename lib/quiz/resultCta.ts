// lib/quiz/resultCta.ts
//
// D'OÙ VIENT LE BOUTON DE LA PAGE DE RÉSULTAT.
//
// Béné, 25 août 2026 : "On vire le CTA par défaut : il faut remplir pour
// chaque profil point barre. Si rien = pas de CTA."
//
// -- CE QUE J'AI TROUVÉ EN ALLANT LE FAIRE ----------------------------
//
// Le repli ne portait pas que le LIBELLÉ, il portait aussi l'ADRESSE :
//
//     resultProfile?.cta_url  || quiz.cta_url
//     resultProfile?.cta_text || quiz.cta_text
//
// Et c'est l'ADRESSE qui décide si le bouton existe. Retirer le repli
// sans rien d'autre ferait donc DISPARAÎTRE le bouton de tout quiz en
// ligne dont les profils n'ont pas leur propre adresse. Sur la page qui
// vend. Voilà pourquoi la migration recopie AVANT que le repli parte.
//
// -- ET LE SONDAGE N'A PAS DE PROFIL ----------------------------------
//
// L'écran de remerciement d'un sondage lit `quiz.cta_text` /
// `quiz.cta_url` directement : il n'y a pas de profil, donc le CTA du
// quiz est le SEUL qui existe. Le supprimer là-bas casserait le bouton
// de tous les sondages.
//
// Deux mécaniques, donc, et elles ne se mélangent jamais. `mecanique`
// est un PARAMÈTRE OBLIGATOIRE : on ne peut pas appeler cette fonction
// sans avoir dit de quel écran on parle. C'est la seule protection qui
// survit au prochain qui touchera au fichier (cf. `analyzeResultCoverage`
// et les contrôles "profil" appliqués à un quiz scoré, 1er août).

/** De quel écran on parle. Jamais deviné. */
export type CtaMecanique = "profil" | "sondage";

export interface CtaSource {
  /** `quiz_results.cta_text` du profil obtenu. */
  profilTexte?: string | null;
  /** `quiz_results.cta_url` du profil obtenu. */
  profilUrl?: string | null;
  /** `quizzes.cta_text`. Le SEUL CTA d'un sondage. */
  quizTexte?: string | null;
  /** `quizzes.cta_url`. Le SEUL CTA d'un sondage. */
  quizUrl?: string | null;
}

export interface CtaResolu {
  /** `null` = AUCUN bouton. C'est le "si rien = pas de CTA". */
  url: string | null;
  /** `null` = l'appelant met son libellé générique traduit. */
  texte: string | null;
}

const propre = (v: string | null | undefined): string | null => {
  const t = String(v ?? "").trim();
  return t.length > 0 ? t : null;
};

/**
 * Rend l'adresse et le libellé du bouton, ou `null` pour "pas de bouton".
 *
 * En `"profil"`, le CTA du quiz n'est JAMAIS consulté : c'est tout
 * l'objet du changement. En `"sondage"`, c'est l'inverse, et le profil
 * n'existe pas.
 */
export function resolveResultCta(mecanique: CtaMecanique, src: CtaSource): CtaResolu {
  if (mecanique === "sondage") {
    return { url: propre(src.quizUrl), texte: propre(src.quizTexte) };
  }
  return { url: propre(src.profilUrl), texte: propre(src.profilTexte) };
}

/**
 * Ce quiz a-t-il des profils qui perdraient leur bouton ?
 *
 * Sert à PROPOSER la reprise dans l'éditeur, pour les quiz déjà en ligne
 * dont la migration n'aurait pas fait le travail (créés entre le
 * déploiement du code et l'application du SQL, ou importés depuis).
 *
 * Béné, 25 août : "on ne modifie pas les quiz existants MAIS on leur
 * propose toujours de bénéficier des améliorations." On ne recopie donc
 * pas en douce à l'ouverture de l'éditeur : on montre un bouton, elle
 * décide.
 */
export function profilsSansCta(
  quizUrl: string | null | undefined,
  profils: { cta_url?: string | null }[],
): number {
  if (!propre(quizUrl)) return 0;
  return profils.filter((p) => !propre(p.cta_url)).length;
}
