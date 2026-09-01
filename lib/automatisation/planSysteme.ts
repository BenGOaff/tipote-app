// lib/automatisation/planSysteme.ts
//
// « CE QU'IL FAUT CRÉER DANS SYSTEME.IO POUR CE QUIZ »
// (Béné, 1er septembre 2026).
//
// "Un onglet Automatisation qui explique le workflow et les tags précis à
// créer dans Systeme.io. Pas un truc générique, un truc réel qui explique
// selon le bonus offert, le CTA, les profils de résultats."
//
// -- POURQUOI CET ÉCRAN EXISTE, ET CE QU'IL RÉPARE ---------------------
//
// Tipote POSE des tags sur le contact Systeme.io. Mais **poser un tag ne
// déclenche rien** : il faut une règle d'automatisation, créée à la main
// dans le tableau de bord, qui écoute ce tag. On l'a mesuré le 31 août,
// et c'est le trou le plus coûteux du produit : une créatrice met son
// quiz en ligne, capte 40 adresses, et il ne se passe rien. Elle n'en
// conclut pas qu'il lui manque une règle. Elle en conclut que Tipote ne
// sert à rien.
//
// -- LA RÈGLE : ON N'ANNONCE QUE CE QUI PART VRAIMENT ------------------
//
// C'est tout l'enjeu du "pas un truc générique". Les six familles de tags
// n'ont PAS les mêmes conditions, et une liste qui les récite toutes
// enverrait la créatrice construire des workflows sur des tags qui ne
// seront jamais posés :
//
//   - les tags de PROFIL ne partent que sur un QUIZ (un sondage n'a pas
//     de résultat) ;
//   - `sio_capture_tag` ne part QUE sur un SONDAGE ;
//   - les tags par RÉPONSE ne partent que sur un sondage ;
//   - les tags de SCORE n'existent que si `sio_score_tags` est coché ET
//     que le quiz a des points ;
//   - le tag de PARTAGE ne part que si le visiteur partage pour de vrai ;
//   - une formation ou une communauté Systeme.io est ouverte PAR TIQUIZ
//     directement : il ne faut SURTOUT pas créer un workflow de plus,
//     sinon l'accès s'ouvre deux fois.
//
// -- LA RECETTE EST DITE UNE FOIS, PAS UNE FOIS PAR TAG ---------------
//
// Béné, 1er septembre, en voyant le premier jet : "empiler les conseils
// qui disent la même chose t'es sûr que c'est le plus lisible, pratique,
// intelligent ? Genre 1 : les profils et 2 : le bonus de partage. Et
// ensuite tu ne répètes pas."
//
// Elle avait raison : les trois clics sont IDENTIQUES pour tous les
// tags. Un quiz à six profils affichait donc six fois la même marche à
// suivre, soit dix-huit lignes pour six informations. Ce module rend
// donc des GROUPES (les profils, le bonus de partage...), chacun avec sa
// liste de tags. L'écran écrit la recette une seule fois, en haut, et
// chaque groupe ne porte plus que ses noms de tags.
//
// -- LE NOM D'UN PROFIL PASSE PAR `resultChoiceLabel` ------------------
//
// Le titre d'un profil est du texte RICHE : il porte des balises et des
// variables. Rendu tel quel, l'écran affichait
// `<div class="rt-field-fs" style="--rt-fs-m: 24px">Team Capture...`.
// La règle existe depuis ce matin (retour Christian) et je l'ai oubliée
// le lendemain, dans le module qui l'aurait le plus utilisée : une règle
// qui n'est pas APPELÉE ne protège de rien.
//
// -- PURE, ET SANS UNE SEULE PHRASE -----------------------------------
//
// L'interface existe en 7 langues. Ce module rend des DONNÉES (le nom
// exact du tag, le type d'étape, le contexte), l'écran écrit les
// phrases. C'est la même règle que partout ailleurs : le serveur dit ce
// qui se passe, l'interface dit comment le dire.

import { resultChoiceLabel } from "@/lib/quiz/resultLabel";
import {
  axisSlug,
  normalizeScoringAxes,
  resolveScoreLabels,
  slugifyAxisLabel,
  type ScoreLabels,
} from "@/lib/quizScoring";

/** Ce que la créatrice devra choisir comme ACTION dans Systeme.io. */
export type ActionSysteme =
  /** S'abonner à une campagne d'emails. */
  | "campagne"
  /** Envoyer un email unique (le bonus, par exemple). */
  | "email"
  /** RIEN À CRÉER : Tipote s'en occupe déjà (formation, communauté). */
  | "rien";

/** La famille d'un groupe. L'écran en tire son titre et son explication. */
export type TypeGroupe =
  | "profils"
  | "capture-sondage"
  | "reponses-sondage"
  | "score"
  | "partage"
  | "acces-automatique";

/**
 * UNE règle à créer : un tag, et ce qu'il désigne.
 *
 * Elle ne porte AUCUNE marche à suivre : les trois clics sont les mêmes
 * pour toutes, ils sont écrits une fois en haut de l'écran.
 */
export interface LigneAutomatisation {
  /** Clé stable pour React et pour les tests. */
  cle: string;
  /** Le nom EXACT du tag, tel que Tipote le posera. */
  tag: string;
  /**
   * Ce que ce tag désigne : le nom du profil, le libellé de la réponse,
   * l'axe de score. NETTOYÉ (`resultChoiceLabel`) : le titre d'un profil
   * est du texte riche, il ne s'affiche jamais brut.
   */
  contexte?: string;
  /**
   * La position du profil (1, 2, 3...), pour que l'écran puisse le
   * nommer quand son titre est encore vide. Le module ne traduit pas.
   */
  rang?: number;
}

/** Une famille de tags, avec l'action à choisir dans Systeme.io. */
export interface GroupeAutomatisation {
  type: TypeGroupe;
  action: ActionSysteme;
  lignes: LigneAutomatisation[];
}

/** Ce qui empêche une règle de fonctionner, ou tout le quiz. */
export type TypeManque =
  /** Aucune clé Systeme.io reliée : AUCUN tag ne part, sur rien. */
  | "cle-api"
  /** Un profil sans tag : ses répondants ne sont taggés nulle part. */
  | "tag-profil"
  /** Le partage est proposé mais aucun tag ne le marque. */
  | "tag-partage"
  /** Un sondage sans tag de capture. */
  | "tag-capture";

export interface ManqueAutomatisation {
  type: TypeManque;
  /** Le profil concerné, quand il y en a un. Nettoyé lui aussi. */
  contexte?: string;
  /** Sa position, quand son titre est vide. */
  rang?: number;
  /** Bloquant = rien ne part du tout tant que ce n'est pas réglé. */
  bloquant: boolean;
}

export interface PlanAutomatisation {
  groupes: GroupeAutomatisation[];
  manques: ManqueAutomatisation[];
}

/** Le quiz, réduit à ce dont le plan a besoin. */
export interface QuizPourPlan {
  mode?: string | null;
  locale?: string | null;
  sio_capture_tag?: string | null;
  sio_share_tag_name?: string | null;
  sio_score_tags?: boolean | null;
  scoring_axes?: unknown;
  score_labels?: unknown;
  show_result_share?: boolean | null;
  virality_enabled?: boolean | null;
}

export interface ResultatPourPlan {
  title?: string | null;
  sio_tag_name?: string | null;
  sio_tag_names?: string[] | null;
  sio_course_id?: string | null;
  sio_community_id?: string | null;
}

export interface QuestionPourPlan {
  options?: Array<{ sio_tag_name?: string | null; text?: string | null } | null> | null;
}

/**
 * CE QUE LE MODULE NE PEUT PAS DEVINER, ET QU'ON LUI DIT.
 *
 * -- POURQUOI CE PARAMÈTRE EXISTE, ET CE QU'IL RÉPARE ------------------
 *
 * Le premier jet lisait `quiz.sio_api_key_id` et criait "aucune clé
 * Systeme.io n'est reliée à ce quiz" quand la colonne était vide.
 * **C'était FAUX pour presque tout le monde.** Cette colonne est une
 * SURCHARGE par quiz (le cas du freelance qui envoie les leads d'UN quiz
 * vers le compte de son client) ; `resolveApiKey` retombe ensuite sur la
 * clé par défaut du compte, puis sur n'importe laquelle, puis sur la clé
 * historique. Une créatrice qui a branché SA clé une fois et n'a jamais
 * touché à la surcharge voyait donc un bandeau rouge lui annoncer que
 * rien ne partait, alors que tout partait.
 *
 * C'est le `??` du 2 août dans une autre robe : **une colonne vide ne
 * veut pas dire "pas de clé", elle veut dire "pas de surcharge".**
 *
 * La question ne se lit donc PAS dans une colonne. Elle se lit là où on
 * demande vraiment ses tags à Systeme.io, et l'écran passe la réponse.
 *
 * `null` = ON NE SAIT PAS ENCORE (le chargement n'a pas répondu, ou il a
 * échoué). On ne dit alors RIEN : un avertissement qui sort à tort fait
 * chercher au mauvais endroit, et c'est exactement ce qu'on répare.
 */
export interface FaitsAutomatisation {
  /**
   * Une clé Systeme.io répond-elle pour ce quiz ?
   *
   * `true` -> on a pu lire ses tags. `false` -> l'API a répondu
   * "aucune clé". `null` -> inconnu, on se tait.
   */
  cleReliee: boolean | null;
}

function propre(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Le nom LISIBLE d'un profil.
 *
 * `resultChoiceLabel` attend un secours obligatoire, et on lui passe ""
 * EXPRÈS : ce module ne traduit pas. Un titre vide rend donc une chaîne
 * vide, et c'est l'écran qui écrit "Profil 3" dans la langue de la
 * créatrice, à partir du `rang`.
 */
function nomProfil(titre: unknown): string {
  return resultChoiceLabel(propre(titre), "");
}

/** Les tags d'un profil, l'ancien champ unique servant de repli. */
export function tagsDuProfil(r: ResultatPourPlan): string[] {
  const multiples = Array.isArray(r.sio_tag_names)
    ? r.sio_tag_names.map(propre).filter(Boolean)
    : [];
  if (multiples.length > 0) return multiples;
  const seul = propre(r.sio_tag_name);
  return seul ? [seul] : [];
}

/**
 * Les noms de tags de score que ce quiz peut poser.
 *
 * Ils sont CALCULÉS au moment de la réponse (`score-eleve`,
 * `sommeil-bas`...), donc on ne peut pas en promettre un seul. On rend
 * la liste complète des valeurs possibles, ce qui est exactement ce
 * qu'il faut pour créer les règles à l'avance.
 */
export function tagsDeScorePossibles(quiz: QuizPourPlan): {
  global: string[];
  parAxe: { axe: string; valeurs: string[] }[];
} {
  const labels: ScoreLabels = resolveScoreLabels(quiz.score_labels, quiz.locale);
  const tranches = [labels.low, labels.mid, labels.high].map(
    (l, i) => slugifyAxisLabel(l) || ["low", "mid", "high"][i],
  );
  const global = tranches.map((t) => `score-${t}`);
  const parAxe = normalizeScoringAxes(quiz.scoring_axes).map((axe) => ({
    axe: propre((axe as { label?: string }).label) || axisSlug(axe),
    valeurs: tranches.map((t) => `${axisSlug(axe)}-${t}`),
  }));
  return { global, parAxe };
}

/**
 * LA CLÉ RÉPOND-ELLE, d'après ce que le chargement des tags a donné ?
 *
 * PURE, donc testable, et c'est tout l'intérêt : la règle est écrite une
 * fois au lieu d'être devinée dans un composant.
 *
 * - des tags reçus -> la clé répond, quelle que soit sa provenance
 *   (surcharge du quiz, défaut du compte, clé historique) ;
 * - `noApiKey` -> l'API a dit qu'il n'y en a AUCUNE : on le dit ;
 * - une erreur, ou rien encore -> ON NE SAIT PAS, et on se tait.
 *
 * Une liste VIDE compte comme une réponse : un compte tout neuf n'a
 * aucun tag, et sa clé marche très bien.
 */
export function cleRelieeDepuisTags(etat: {
  tags: unknown[] | null;
  noApiKey: boolean;
  error: boolean;
}): boolean | null {
  if (Array.isArray(etat.tags)) return true;
  if (etat.noApiKey) return false;
  return null;
}

/**
 * Le plan complet pour UN quiz.
 *
 * PURE. Ne rend que des tags qui partent VRAIMENT, groupés par famille,
 * et signale à part ce qui manque pour qu'ils partent.
 *
 * L'ORDRE DES GROUPES EST L'ORDRE DU PARCOURS, et il n'est pas
 * décoratif : ce que le visiteur déclenche en premier vient en premier,
 * donc les profils (ou la capture d'un sondage) avant le bonus de
 * partage. Le groupe "rien à créer" passe en dernier : c'est une note,
 * pas une tâche.
 */
export function construirePlanAutomatisation(
  quiz: QuizPourPlan,
  resultats: ResultatPourPlan[],
  questions: QuestionPourPlan[],
  faits: FaitsAutomatisation,
): PlanAutomatisation {
  const groupes: GroupeAutomatisation[] = [];
  const manques: ManqueAutomatisation[] = [];
  const estSondage = propre(quiz.mode) === "survey";

  // BLOQUANT EN PREMIER. Sans clé, aucun contact n'est créé et aucun tag
  // n'est posé : tout le reste de l'écran serait un plan pour rien.
  //
  // On ne le dit QUE si on le SAIT (`false`). `null` veut dire que le
  // chargement n'a pas encore répondu : se taire est la bonne réponse,
  // un bandeau rouge affiché à tort fait chercher au mauvais endroit.
  if (faits.cleReliee === false) {
    manques.push({ type: "cle-api", bloquant: true });
  }

  const ajouter = (g: GroupeAutomatisation) => {
    if (g.lignes.length > 0) groupes.push(g);
  };

  if (estSondage) {
    const capture = propre(quiz.sio_capture_tag);
    if (capture) {
      ajouter({
        type: "capture-sondage",
        action: "campagne",
        lignes: [{ cle: "capture", tag: capture }],
      });
    } else {
      manques.push({ type: "tag-capture", bloquant: false });
    }

    // Les tags par RÉPONSE. Une seule ligne par tag distinct : la même
    // règle sert toutes les questions qui portent ce tag, et en créer
    // une par question ferait partir la campagne plusieurs fois.
    const vus = new Set<string>();
    const reponses: LigneAutomatisation[] = [];
    questions.forEach((q) => {
      (q.options ?? []).forEach((o) => {
        const tag = propre(o?.sio_tag_name);
        if (!tag || vus.has(tag.toLowerCase())) return;
        vus.add(tag.toLowerCase());
        reponses.push({
          cle: `reponse-${tag}`,
          tag,
          contexte: nomProfil(o?.text) || undefined,
        });
      });
    });
    ajouter({ type: "reponses-sondage", action: "campagne", lignes: reponses });
  } else {
    // UN QUIZ : ce sont les profils qui taguent, jamais le tag de
    // capture (il n'est appliqué que sur les sondages).
    const profils: LigneAutomatisation[] = [];
    const acces: LigneAutomatisation[] = [];
    resultats.forEach((r, i) => {
      const nom = nomProfil(r.title);
      const tags = tagsDuProfil(r);
      if (tags.length === 0) {
        manques.push({
          type: "tag-profil",
          contexte: nom || undefined,
          rang: i + 1,
          bloquant: false,
        });
        return;
      }
      tags.forEach((tag, j) => {
        profils.push({
          cle: `profil-${i}-${j}`,
          tag,
          contexte: nom || undefined,
          rang: i + 1,
        });
      });
      // Formation ou communauté : TIQUIZ ouvre l'accès lui même. Une
      // règle de plus ouvrirait l'accès deux fois, et c'est le genre de
      // doublon qu'on ne voit qu'en recevant deux emails.
      if (propre(r.sio_course_id) || propre(r.sio_community_id)) {
        acces.push({
          cle: `acces-${i}`,
          tag: tags[0],
          contexte: nom || undefined,
          rang: i + 1,
        });
      }
    });
    ajouter({ type: "profils", action: "campagne", lignes: profils });

    // LES TAGS DE SCORE, seulement s'ils sont cochés.
    //
    // Chaque valeur possible devient UNE ligne : le tag n'est pas un
    // nom fixe (il dépend du score obtenu), et annoncer un motif obligeait
    // la créatrice à le déplier de tête. Une ligne = une règle à créer.
    if (quiz.sio_score_tags === true) {
      const { global, parAxe } = tagsDeScorePossibles(quiz);
      const scores: LigneAutomatisation[] = global.map((tag) => ({
        cle: `score-${tag}`,
        tag,
      }));
      parAxe.forEach((a) => {
        a.valeurs.forEach((tag) => {
          scores.push({ cle: `score-${tag}`, tag, contexte: a.axe });
        });
      });
      ajouter({ type: "score", action: "campagne", lignes: scores });
    }

    ajouter({ type: "acces-automatique", action: "rien", lignes: acces });
  }

  // LE BONUS DE PARTAGE. Un seul workflow, quel que soit le nombre de
  // profils : le tag est posé au niveau du quiz.
  //
  // MESURÉ dans la route de partage, pas déduit : le tag part dès qu'il
  // est RENSEIGNÉ, sans regarder `virality_enabled`. On annonce donc
  // le groupe dans ce cas là, et pas seulement quand le bonus de partage
  // est activé. Sans tag renseigné, aucun groupe : c'est la demande de
  // Béné, "ne pas montrer si pas de partage activé".
  const tagPartage = propre(quiz.sio_share_tag_name);
  if (tagPartage) {
    ajouter({
      type: "partage",
      action: "email",
      lignes: [{ cle: "partage", tag: tagPartage }],
    });
  } else if (quiz.virality_enabled === true) {
    // On ne réclame le tag QUE si un bonus de partage est réellement
    // promis. Les simples boutons de partage de la page de résultat
    // (`show_result_share`, vrai par défaut) ne promettent rien : crier
    // là dessus ferait rougir l'écran de presque tout le monde, et un
    // avertissement qui sort pour rien finit ignoré.
    manques.push({ type: "tag-partage", bloquant: false });
  }

  // Le groupe "rien à créer" passe en DERNIER, même sur un quiz qui n'a
  // que ça : c'est une note, et une note ne s'ouvre pas en tête de page.
  const iRien = groupes.findIndex((g) => g.action === "rien");
  if (iRien >= 0 && iRien !== groupes.length - 1) {
    groupes.push(groupes.splice(iRien, 1)[0]);
  }

  return { groupes, manques };
}
