// lib/generateurs/sequences.ts
//
// UN GÉNÉRATEUR D'EMAILS ÉCRIT DES EMAILS, PAS DES PISTES.
//
// Béné, 2 septembre 2026 : "le générateur d'emails ne génère pas 'des
// pistes' mais des emails putain t'as fait n'imp."
//
// Elle a raison, et c'est la même faute que le 1er août : une mécanique
// écrite pour un cas, appliquée telle quelle à un autre. J'avais fait
// passer les TROIS générateurs par l'étape "trois pistes au choix",
// alors qu'elle ne veut dire quelque chose que pour UN.
//
// -- CE QUE FAIT L'ATELIER, ET POURQUOI IL A RAISON -------------------
//
// Là bas, le labo BONUS a bien ses pistes (`library -> brief -> pistes
// -> produce`) : la créatrice choisit QUEL bonus elle fabrique, et ce
// choix lui appartient. Le funnel EMAILS, lui, n'en a aucune : un bouton,
// et cinq emails arrivent. Parce qu'il n'y a rien à choisir. Une séquence
// post-quiz a toujours les mêmes cinq temps, et demander "quelle piste
// pour ta séquence ?" fait porter une décision d'auteur à quelqu'un qui
// voulait juste ses emails.
//
// | Générateur | Pistes ? | Pourquoi |
// |---|---|---|
// | bonus  | OUI | le bonus est une CRÉATION : trois idées valent mieux qu'une imposée |
// | emails | NON | la séquence a des temps fixes, elle se déroule |
// | promo  | NON | annoncer un quiz est une routine, pas une création |
//
// -- LES CINQ TEMPS SONT CEUX DE L'ATELIER, MOT POUR MOT --------------
//
// Ils ont été écrits là bas, corrigés par les retours de vraies élèves
// (Fabienne, 7 août), et ils sont enseignés dans la formation. Les
// réécrire ici donnerait deux méthodes pour la même chose, et Tiquiz
// serait celui qui se trompe.
//
// -- L'INTENTION EST EN FRANÇAIS, LE LIBELLÉ NE L'EST PAS -------------
//
// `intention` part dans le prompt, avec le reste des consignes, qui sont
// en français dans tout ce dépôt : c'est une instruction au modèle, pas
// un texte lu par la créatrice. `cle`, elle, est traduite par l'écran :
// l'interface existe en 7 langues, et un rôle affiché en français serait
// exactement le "Résultat 4" du 1er septembre.

import type { Bloc } from "@/lib/generateurs/blocs";
import type { GenerateurId } from "@/lib/generateurs/catalogue";

/** Un morceau du plan fixe : son bloc, son rang, son rôle. */
export interface TempsFixe {
  bloc: Bloc;
  /** La clé i18n du libellé affiché ("Son résultat"). */
  cle: string;
  /** Ce que le modèle doit écrire à ce temps là. Part dans le prompt. */
  intention: string;
}

/**
 * LA SÉQUENCE POST-QUIZ, cinq temps, portée de l'Atelier.
 *
 * L'ordre est la séquence : il ne se réarrange pas. Le 4e est le SEUL
 * qui vend, et c'est ce qui rend les trois premiers crédibles.
 */
export const SEQUENCE_EMAILS: readonly TempsFixe[] = [
  {
    bloc: "email",
    cle: "sonResultat",
    intention:
      "Il VIENT de lire son profil sur la page de résultat : ne le réécris pas. Tu le nommes en une phrase pour qu'il se retrouve, puis tu apportes ce que la page ne disait pas : ce que ce profil implique pour la suite, et ce qui arrive dans les prochains jours. Cet email est la trace durable de son résultat, pas sa copie. Aucune vente ici.",
  },
  {
    bloc: "email",
    cle: "unConseil",
    intention:
      "Tu donnes avant de demander : un conseil précis, applicable aujourd'hui, tiré de son profil. C'est ce qui installe la confiance.",
  },
  {
    bloc: "email",
    cle: "ceQuiLeRetient",
    intention:
      "Tu réponds à ses objections avant qu'il ait à te les poser. Nomme l'objection la plus probable POUR CE PROFIL, et démonte-la sans agressivité.",
  },
  {
    bloc: "email",
    cle: "tonOffre",
    intention:
      "Tu proposes la suite logique, au moment où elle a du sens. C'est le SEUL email avec un appel à l'action commercial.",
  },
  {
    bloc: "email",
    cle: "resterEnContact",
    intention:
      "Une autre ressource, le blog, la chaîne : il reste dans ton univers même s'il n'achète pas aujourd'hui. Aucune pression, aucune relance culpabilisante.",
  },
] as const;

/**
 * LA PROMOTION DU QUIZ : trois emails, quatre publications.
 *
 * Elle ne s'adresse PAS aux mêmes gens que la séquence : ici personne
 * n'a encore répondu, donc personne n'a de profil. On ne parle que du
 * quiz, de ce qu'il révèle, et du temps qu'il prend.
 *
 * Les quatre publications attaquent par quatre angles DIFFÉRENTS : quatre
 * posts qui disent la même chose autrement, c'est un post publié quatre
 * fois, et l'audience le voit.
 */
export const SEQUENCE_PROMO: readonly TempsFixe[] = [
  {
    bloc: "email",
    cle: "annonce",
    intention:
      "L'annonce à sa liste : ce que le quiz révèle, pour qui, en combien de temps. Un seul lien, une seule action. Pas de suspense artificiel.",
  },
  {
    bloc: "email",
    cle: "relance",
    intention:
      "La relance, quelques jours après, pour ceux qui n'ont pas cliqué. Un ANGLE différent du premier email : pas le même argument dit plus fort.",
  },
  {
    bloc: "email",
    cle: "partenaire",
    intention:
      "Un message à un partenaire ou à un collègue, pour qu'il partage le quiz à SON audience. Court, direct, et il dit ce que l'autre y gagne.",
  },
  {
    bloc: "post",
    cle: "curiosite",
    intention:
      "Un post qui ouvre une question que la cible se pose déjà, et qui laisse le quiz y répondre. Pas de teasing creux : la question doit valoir la peine toute seule.",
  },
  {
    bloc: "post",
    cle: "erreurFrequente",
    intention:
      "Un post qui nomme l'erreur la plus fréquente sur ce sujet, et qui montre pourquoi elle est logique. On finit sur le quiz comme moyen de savoir où on en est.",
  },
  {
    bloc: "post",
    cle: "coulisses",
    intention:
      "Un post en coulisses : pourquoi elle a fait ce quiz, ce qu'elle voit revenir chez les gens. Le ton le plus personnel des quatre.",
  },
  {
    bloc: "post",
    cle: "appelDirect",
    intention:
      "Un post court et direct : fais le test, voilà le lien. C'est le seul des quatre qui n'a rien à raconter, et c'est voulu.",
  },
] as const;

/** Le plan fixe d'un générateur, ou `null` quand il passe par les pistes. */
export function planFixe(id: GenerateurId): readonly TempsFixe[] | null {
  if (id === "emails") return SEQUENCE_EMAILS;
  if (id === "promo") return SEQUENCE_PROMO;
  return null;
}

/**
 * Ce générateur passe-t-il par l'étape des pistes ?
 *
 * C'est un PARAMÈTRE de la mécanique, pas une déduction : le déduire de
 * la présence d'un plan marcherait aujourd'hui et casserait au premier
 * générateur qui aurait les deux. Les deux fonctions disent la même
 * chose, et le test l'exige, mais l'appelant dit laquelle il veut.
 */
export function passeParLesPistes(id: GenerateurId): boolean {
  return id === "bonus";
}
