// lib/generateurs/bibliotheque.ts
//
// MES CONTENUS GÉNÉRÉS : ce qu'on a écrit, et où le retrouver.
//
// Béné, 2 septembre 2026 : "il faut aussi que les users retrouvent leurs
// créations dans 'générateurs' : ajoute une étape avec le choix -> 'mes
// contenus générés' > 3 blocs pour classer les 3 types de contenus
// générés OU 'générer de nouveaux contenus' > 3 générateurs."
//
// Jusqu'ici un contenu généré vivait dans l'onglet du navigateur et
// nulle part ailleurs : un rafraîchissement, et le travail était perdu.
// Côté Tipote il était même PAYÉ en crédits, donc perdu et facturé.
//
// -- CE MODULE NE TOUCHE PAS À LA BASE --------------------------------
//
// Il décide, il ne lit rien. `contenusStore.ts` importe `supabaseAdmin`,
// donc aucun test ne peut le charger : c'est exactement là que les bugs
// s'installent (leçon du verrou des webhooks, 24 août). Les décisions
// vivent ici, en fonctions pures.
//
// -- ET IL NE REND AUCUNE PHRASE --------------------------------------
//
// L'interface existe en 7 langues, et les contenus sont écrits dans la
// langue du QUIZ, qui peut être une des 100 du catalogue. Ce module rend
// des données et des clés ; l'écran écrit.

import { GENERATEURS, type GenerateurId } from "@/lib/generateurs/catalogue";
import type { Bloc } from "@/lib/generateurs/blocs";

/** Un morceau enregistré. */
export interface MorceauEnregistre {
  bloc: Bloc;
  index: number;
  /** La clé i18n du rôle, sur les générateurs à plan fixe. */
  cle?: string;
  markdown: string;
  /** Le modèle a été coupé : l'écran le dit au lieu de faire croire à un texte fini. */
  tronque?: boolean;
}

/** Une livraison : un générateur, un projet, et ses morceaux. */
export interface ContenuGenere {
  id: string;
  generateur: GenerateurId;
  quizId: string | null;
  /** RECOPIÉ à l'enregistrement : un quiz supprimé ne doit pas rendre ses emails illisibles. */
  quizTitre: string;
  titre: string;
  profilIndex: number | null;
  profilTitre: string;
  morceaux: MorceauEnregistre[];
  creeLe: string;
  majLe: string;
}

const texte = (v: unknown): string => String(v ?? "").trim();

/** Une ligne de base traduite en contenu, ou `null` si elle est inexploitable. */
export function lireContenu(ligne: Record<string, unknown> | null | undefined): ContenuGenere | null {
  if (!ligne) return null;
  const generateur = texte(ligne.generateur) as GenerateurId;
  if (!GENERATEURS.includes(generateur)) return null;
  const id = texte(ligne.id);
  if (!id) return null;

  const brutes = Array.isArray(ligne.pieces) ? (ligne.pieces as Record<string, unknown>[]) : [];
  const morceaux: MorceauEnregistre[] = brutes
    .map((m) => ({
      bloc: texte(m?.bloc) as Bloc,
      index: Number(m?.index ?? 0) || 0,
      cle: texte(m?.cle) || undefined,
      markdown: String(m?.markdown ?? ""),
      tronque: m?.tronque === true,
    }))
    // Un morceau vide n'a rien à montrer, et il ferait croire à un
    // contenu incomplet alors qu'il n'a simplement jamais été écrit.
    .filter((m) => m.markdown.trim().length > 0);

  return {
    id,
    generateur,
    quizId: texte(ligne.quiz_id) || null,
    quizTitre: texte(ligne.quiz_titre),
    titre: texte(ligne.titre),
    profilIndex:
      ligne.profil_index === null || ligne.profil_index === undefined
        ? null
        : Number(ligne.profil_index),
    profilTitre: texte(ligne.profil_titre),
    morceaux,
    creeLe: texte(ligne.created_at),
    majLe: texte(ligne.updated_at) || texte(ligne.created_at),
  };
}

/**
 * Les trois blocs de classement, TOUJOURS les trois.
 *
 * Un bloc vide reste affiché : sa présence dit que le générateur existe
 * et qu'on n'a rien écrit avec, ce qui est une information. Le masquer
 * ferait croire qu'il n'y a que deux générateurs, et c'est exactement le
 * vide muet que Béné refuse depuis la page Mes liens (24 août).
 */
export function classerParGenerateur(
  contenus: readonly ContenuGenere[],
): { generateur: GenerateurId; contenus: ContenuGenere[] }[] {
  return GENERATEURS.map((generateur) => ({
    generateur,
    contenus: contenus.filter((c) => c.generateur === generateur).slice().sort(parDateDesc),
  }));
}

/** Le plus récent en premier : c'est celui qu'on vient d'écrire. */
export function parDateDesc(a: ContenuGenere, b: ContenuGenere): number {
  return (b.majLe || b.creeLe).localeCompare(a.majLe || a.creeLe);
}

/**
 * De quoi nommer une livraison à l'écran, sans jamais rendre de phrase.
 *
 * L'ordre compte : le TITRE de la piste s'il existe (c'est le nom que la
 * créatrice a choisi pour son bonus), sinon le PROFIL (une séquence
 * d'emails n'a pas d'autre nom que "pour le profil X"), sinon le quiz.
 * Rendre le quiz en premier donnerait cinq lignes identiques à qui a
 * généré la séquence de ses cinq profils.
 */
export function etiquetteContenu(c: ContenuGenere): { principale: string; secondaire: string } {
  const principale = c.titre || c.profilTitre || c.quizTitre;
  const secondaire =
    c.titre && c.profilTitre ? `${c.profilTitre} · ${c.quizTitre}` : c.titre ? c.quizTitre : c.profilTitre ? c.quizTitre : "";
  return { principale, secondaire };
}

/** Combien de morceaux, et combien ont été coupés en route. */
export function resumeMorceaux(c: ContenuGenere): { total: number; tronques: number } {
  return {
    total: c.morceaux.length,
    tronques: c.morceaux.filter((m) => m.tronque).length,
  };
}

/**
 * La clé d'une livraison, pour la retrouver et la compléter.
 *
 * On écrit AU FUR ET À MESURE (un morceau à la fois, cf. `blocs.ts`), et
 * une génération dure une minute et demie : n'enregistrer qu'à la fin
 * perdrait tout si la personne ferme l'onglet au septième morceau, donc
 * après avoir tout payé. Les morceaux d'une même livraison doivent donc
 * se ranger dans la MÊME ligne, et cette clé est ce qui le permet.
 *
 * Le profil en fait partie : deux séquences écrites pour deux profils du
 * même quiz sont deux livraisons, pas une.
 */
export function cleLivraison(a: {
  generateur: GenerateurId;
  quizId: string | null;
  profilIndex: number | null;
  titre: string;
}): string {
  return [a.generateur, a.quizId ?? "", a.profilIndex ?? "", a.titre].join("|");
}
