// lib/quiz/introLayout.ts
//
// L'ÉCRAN D'ACCUEIL : LOGO ET LARGEUR DE TEXTE (retours Béné, 3 août 2026).
//
// Deux demandes distinctes, toutes les deux nées du même correctif
// d'alignement de la veille.
//
// 1. "Si je centre mon titre à gauche, il centre aussi le logo : on doit
//    pouvoir centrer, aligner à gauche ou à droite le logo indépendamment
//    du titre ET on doit aussi pouvoir l'agrandir et le rétrécir comme
//    pour les gif et les images."
//
//    En calant le logo sur le titre, on avait réglé un décalage et créé
//    une contrainte : le logo n'avait plus de vie propre. Or un logo
//    n'est pas un bloc de texte, il ne "commence" pas au même endroit
//    qu'une phrase, et beaucoup de marques le veulent centré au dessus
//    d'un titre aligné à gauche.
//
// 2. "Pourquoi la case du sous titre est plus courte que celle du titre ??
//    Elle a une marge à droite que le titre n'a pas et du coup c'est
//    impossible de lui donner la même longueur visuellement."
//
//    Elle décrivait exactement ce qui se passait. Le titre vivait dans le
//    conteneur `max-w-2xl`, le sous-titre portait EN PLUS un `max-w-xl`
//    écrit en dur (42rem contre 36rem). Tant que tout était centré, les
//    deux bords se répartissaient et ça ne se voyait pas. Aligné à
//    gauche, le sous-titre s'arrêtait 6rem avant le titre, et aucun
//    réglage ne pouvait rattraper ça puisque la borne était en dur.
//
//    La correction n'est pas de retirer la borne (une ligne de 42rem est
//    longue à lire) : c'est de la faire porter par le CONTENEUR COMMUN.
//    Titre et sous-titre partagent alors la même largeur par
//    construction, et la créatrice la règle d'un seul curseur.

// ── Alignement du logo ──────────────────────────────────────────────

export type BlockAlign = "left" | "center" | "right";
/** "auto" = le logo suit le titre, comme avant ce réglage. */
export type LogoAlign = "auto" | BlockAlign;

/**
 * Alignement du logo demandé par la créatrice.
 *
 * "auto" est le DÉFAUT et vaut "comme le titre" : c'est ce qui garantit
 * qu'aucun quiz existant ne bouge. Une valeur inconnue en base (colonne
 * absente, typo) retombe sur "auto" pour la même raison.
 */
export function logoAlignSetting(raw: string | null | undefined): LogoAlign {
  return raw === "left" || raw === "center" || raw === "right" ? raw : "auto";
}

/**
 * L'alignement effectif du logo : le sien s'il en a un, sinon celui du
 * titre.
 *
 * `titleAlign` est déjà le résultat de `resolveBlockAlign` : on ne
 * recalcule pas l'alignement du titre ici, on le reçoit. Deux endroits
 * qui calculent l'alignement du titre finiraient par diverger.
 */
export function resolveLogoAlign(
  setting: string | null | undefined,
  titleAlign: BlockAlign,
): BlockAlign {
  const own = logoAlignSetting(setting);
  return own === "auto" ? titleAlign : own;
}

// ── Taille du logo ──────────────────────────────────────────────────

/** Bornes du curseur. En dessous de 10% un logo n'est plus lisible. */
export const LOGO_WIDTH_MIN = 10;
export const LOGO_WIDTH_MAX = 100;

/**
 * Largeur du logo en % du bloc de contenu, ou `null` pour la taille
 * historique.
 *
 * `null` est essentiel : c'est lui qui rend `max-h-16 w-auto`, la taille
 * qu'ont TOUS les quiz d'avant ce réglage. Une valeur hors bornes est
 * traitée comme absente, jamais rabotée : mieux vaut la taille d'avant
 * qu'une taille inventée.
 */
export function logoWidthPct(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const w = Math.round(raw);
  if (w < LOGO_WIDTH_MIN || w > LOGO_WIDTH_MAX) return null;
  return w;
}

export type LogoRender = {
  /** Classes du conteneur flex (porte l'alignement). */
  wrapperClass: string;
  imgClass: string;
  imgStyle: Record<string, string> | undefined;
};

const JUSTIFY: Record<BlockAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

/**
 * Tout ce qu'il faut pour rendre le logo, décidé UNE fois pour le viewer
 * public ET pour l'aperçu de l'éditeur.
 *
 * Sans largeur : `max-h-16 w-auto object-contain`, le rendu historique au
 * pixel près. Avec largeur : `h-auto` + une largeur en %, exactement le
 * système des images et des gifs, comme demandé.
 */
export function logoRender(
  align: BlockAlign,
  widthPct: number | null,
): LogoRender {
  return {
    wrapperClass: `flex ${JUSTIFY[align]}`,
    imgClass: widthPct == null
      ? "max-h-16 w-auto object-contain"
      : "h-auto object-contain",
    imgStyle: widthPct == null ? undefined : { width: `${widthPct}%` },
  };
}

// ── Largeur du bloc de texte d'accueil ──────────────────────────────

/** Sous 50%, le titre se casse en confettis sur mobile. */
export const INTRO_WIDTH_MIN = 50;
export const INTRO_WIDTH_MAX = 100;

/**
 * Largeur du bloc titre + sous-titre, en % du conteneur.
 *
 * `null` = pleine largeur, et c'est le DÉFAUT voulu : "par défaut, mêmes
 * marges, même padding, même alignement". Le titre et le sous-titre
 * vivent dans le même conteneur, donc ils partagent cette largeur par
 * construction. Il n'y a plus de borne écrite en dur sur l'un des deux
 * qui puisse les désaligner.
 */
export function introTextWidthPct(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const w = Math.round(raw);
  if (w < INTRO_WIDTH_MIN || w >= INTRO_WIDTH_MAX) return null;
  return w;
}

/**
 * Le style du conteneur commun titre + sous-titre.
 *
 * La largeur s'applique au CONTENEUR, jamais aux enfants : c'est ce qui
 * rend impossible le retour du bug. `alignBlockMarginClass` place ensuite
 * ce conteneur rétréci du bon côté (à gauche sous un titre à gauche, et
 * pas centré).
 */
export function introTextWidthStyle(widthPct: number | null): Record<string, string> | undefined {
  return widthPct == null ? undefined : { width: `${widthPct}%` };
}
