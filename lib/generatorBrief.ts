// lib/generatorBrief.ts
//
// Le brief d'écriture d'un utilisateur, retenu d'une génération à la
// suivante.
//
// DEMANDE CHRISTELLE (2 août 2026) : "je voudrais que les infos
// complétées pour générer un contenu soient persistantes, pour ne pas
// avoir à tout réécrire quand je veux rédiger un mail, un post et un
// article sur le même thème."
//
// Le format change (email, post, article), le CONTEXTE non : à qui on
// parle, sur quel sujet, sous quel angle, sur quel ton, pour quel
// objectif. C'est ce contexte qu'on retient, jamais le format.
//
// Deux garde-fous, parce qu'un contexte périmé appliqué en silence
// produit un texte à côté de la plaque sans que personne ne le voie
// (c'est la famille de bugs qui nous a déjà coûté cher) :
//   1. un brief repris est ANNONCÉ à l'écran, jamais restauré en douce ;
//   2. il se vide en un clic.
//
// Le stockage est une table unique (`generator_briefs`), une ligne par
// (utilisateur, scope). Le scope isole les générateurs entre eux :
// l'atelier d'écriture de l'espace affilié ne doit pas hériter du brief
// du générateur de contenu, ils ne parlent pas de la même chose.

/** Champs retenus. Tous facultatifs : un générateur n'en utilise qu'une partie. */
export const BRIEF_FIELDS = [
  "audience",
  "subject",
  "angle",
  "tone",
  "goal",
  "prompt",
  "tags",
] as const;

export type BriefField = (typeof BRIEF_FIELDS)[number];
export type GeneratorBrief = Partial<Record<BriefField, string>>;

/** Un champ démesuré ne sert personne et gonfle le prompt : on borne. */
const MAX_FIELD_LENGTH = 4000;

/**
 * Nettoie ce qui vient du client ou de la base : on ne garde que les
 * champs connus, en texte, coupés, et on jette les vides.
 *
 * Volontairement tolérant : une valeur illisible est ignorée, jamais une
 * erreur. Un brief est un confort, il ne doit jamais bloquer une
 * génération.
 */
export function sanitizeBrief(raw: unknown): GeneratorBrief {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: GeneratorBrief = {};
  for (const key of BRIEF_FIELDS) {
    const v = src[key];
    if (typeof v !== "string") continue;
    const clean = v.trim().slice(0, MAX_FIELD_LENGTH);
    if (clean) out[key] = clean;
  }
  return out;
}

/** Rien à reprendre : l'écran n'annonce rien et n'affiche pas le bouton. */
export function briefIsEmpty(brief: GeneratorBrief | null | undefined): boolean {
  if (!brief) return true;
  return BRIEF_FIELDS.every((k) => !brief[k]);
}

/**
 * Scopes en vigueur. Une chaîne libre serait un piège : deux écrans qui
 * écrivent "content" et "contenu" ne partageraient rien, et personne ne
 * s'en apercevrait avant qu'un utilisateur ne le signale.
 */
export const BRIEF_SCOPES = ["content", "affiliate:tiquiz", "affiliate:atelier"] as const;
export type BriefScope = (typeof BRIEF_SCOPES)[number];

export function isBriefScope(v: unknown): v is BriefScope {
  return typeof v === "string" && (BRIEF_SCOPES as readonly string[]).includes(v);
}

/**
 * Le brief du générateur de contenu porte la ligne "Génère un contenu de
 * type X", construite au chargement de la page. Reprise telle quelle
 * d'une fois sur l'autre, elle annoncerait "email" alors que
 * l'utilisatrice écrit un post : le modèle recevrait deux consignes
 * contradictoires. On la remet à jour au moment de reprendre.
 *
 * Fail-open : si la ligne n'est pas retrouvée (brief réécrit à la main),
 * on rend le texte inchangé. Mieux vaut le brief de l'utilisatrice qu'un
 * texte que le code aurait bricolé.
 */
const TYPE_LINE = /^Génère un contenu de type "[^"]*"/m;

export function retargetPromptType(prompt: string, type: string): string {
  if (!prompt) return prompt;
  return prompt.replace(TYPE_LINE, `Génère un contenu de type "${type}"`);
}
