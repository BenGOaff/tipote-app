// lib/generateurs/projet.ts
//
// CE QU'ON GARDE D'UN CONTENU POUR POUVOIR LE REPRENDRE.
//
// Béné, 3 septembre 2026 : "oui fais la migration."
//
// `generateur_contenus` gardait les MORCEAUX depuis le 2 septembre, donc
// plus rien n'était perdu à un rafraîchissement. Mais elle ne gardait
// pas de quoi CONTINUER : ni le brief, ni les pistes, ni celle qui a été
// choisie. La bibliothèque LISAIT le travail sans pouvoir le reprendre,
// donc corriger un email ou écrire le contenu du 3e profil demandait de
// tout resaisir et de REPAYER les pistes.
//
// -- CE MODULE NE TOUCHE PAS À LA BASE, ET C'EST VOULU ----------------
//
// Il décide ce qui a le droit d'entrer (`assainirProjet`), comment le
// contenu s'appelle dans la liste (`titreDuProjet`) et s'il mérite d'y
// figurer (`meriteEtreGarde`). `contenusStore.ts` écrit, et ne décide
// rien : un module qui importe `supabaseAdmin` est un module qu'aucun
// test ne peut charger, donc exactement là où les bugs s'installent
// (règle du 1er août, et le verrou des webhooks du 24).
//
// -- LA COLONNE EST DU JSONB LIBRE, DONC LE CONTRÔLE EST ICI ----------
//
// Ajouter un champ au brief ne doit pas demander une migration (même
// choix que `bonus_projects` chez lui). On borne donc la FORME et la
// TAILLE ici, et on ne fige jamais la liste des champs.

import { BLOCS, type Bloc } from "@/lib/generateurs/blocs";
import { DECLENCHEURS, FORMATS_OFFRE, PLANS_BONUS } from "@/lib/generateurs/offre";
import type { Declencheur, Offre, PlanBonus } from "@/lib/generateurs/offre";

/** Ce qu'on garde du brief : de quoi rouvrir l'écran tel qu'elle l'avait. */
export interface BriefEnregistre {
  plan: PlanBonus;
  declencheur: Declencheur;
  offres: Offre[];
}

/** Une piste enregistrée, telle qu'elle a été MONTRÉE. */
export interface PisteEnregistree {
  titre: string;
  format: string;
  punchline: string;
  pourquoi: string;
  tempsParPersonne: string;
  pieces: { bloc: Bloc; index: number; resume: string; cle?: string }[];
}

export interface ProjetEnregistre {
  brief: BriefEnregistre;
  pistes: PisteEnregistree[];
  /** Celle qui a été choisie, ou `null` si on en est encore aux pistes. */
  piste: PisteEnregistree | null;
}

// Au delà, ce n'est plus un contenu, c'est une erreur ou un abus.
const MAX_OFFRES = 12;
const MAX_PISTES = 6;
const MAX_PIECES = 20;
const MAX_PROMESSE = 600;
const MAX_TITRE = 300;
const MAX_PHRASE = 600;

const txt = (v: unknown, max: number): string => String(v ?? "").slice(0, max);

function assainirOffre(o: unknown): Offre {
  const r = (o ?? {}) as Record<string, unknown>;
  const format = String(r.format ?? "");
  return {
    promesse: txt(r.promesse, MAX_PROMESSE),
    // UN FORMAT INCONNU RETOMBE SUR LE PREMIER, il ne casse pas la
    // reprise : une valeur illisible en base ne doit pas rendre un
    // contenu impossible à rouvrir.
    format: (FORMATS_OFFRE as readonly string[]).includes(format)
      ? (format as Offre["format"])
      : "formation",
    prix: txt(r.prix, 120),
    profils: Array.isArray(r.profils)
      ? r.profils
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < 30)
          .slice(0, 30)
      : [],
  };
}

function assainirPiste(p: unknown): PisteEnregistree {
  const r = (p ?? {}) as Record<string, unknown>;
  const brutes = Array.isArray(r.pieces) ? (r.pieces as Record<string, unknown>[]) : [];
  return {
    titre: txt(r.titre, MAX_TITRE),
    format: txt(r.format, 160),
    punchline: txt(r.punchline, MAX_PHRASE),
    pourquoi: txt(r.pourquoi, MAX_PHRASE),
    tempsParPersonne: txt(r.tempsParPersonne, MAX_PHRASE),
    pieces: brutes
      .map((m) => ({
        bloc: String(m?.bloc ?? "") as Bloc,
        index: Number(m?.index ?? 0) || 0,
        resume: txt(m?.resume, 400),
        cle: txt(m?.cle, 60) || undefined,
      }))
      // Un bloc inconnu désignerait un dossier qui n'existe pas à
      // l'écran : on le laisse tomber plutôt que d'afficher une carte
      // vide qu'aucun bouton ne peut remplir.
      .filter((m) => (BLOCS as readonly string[]).includes(m.bloc) && m.index >= 1)
      .slice(0, MAX_PIECES),
  };
}

/**
 * CE QUI A LE DROIT D'ENTRER EN BASE.
 *
 * Jamais d'exception : une reprise doit être possible même sur une ligne
 * abîmée. Un plan ou un déclencheur illisible retombe sur son défaut,
 * qui est le cas le plus courant et le moins surprenant.
 */
export function assainirProjet(input: unknown): ProjetEnregistre {
  const o = (input ?? {}) as Record<string, unknown>;
  const b = (o.brief ?? {}) as Record<string, unknown>;
  const plan = String(b.plan ?? "");
  const declencheur = String(b.declencheur ?? "");

  return {
    brief: {
      plan: (PLANS_BONUS as readonly string[]).includes(plan) ? (plan as PlanBonus) : "commun",
      declencheur: (DECLENCHEURS as readonly string[]).includes(declencheur)
        ? (declencheur as Declencheur)
        : "completion",
      offres: Array.isArray(b.offres) ? b.offres.slice(0, MAX_OFFRES).map(assainirOffre) : [],
    },
    pistes: Array.isArray(o.pistes) ? o.pistes.slice(0, MAX_PISTES).map(assainirPiste) : [],
    piste: o.piste && typeof o.piste === "object" ? assainirPiste(o.piste) : null,
  };
}

/**
 * PEUT-ON REPRENDRE CE CONTENU ?
 *
 * Non pour tout ce qui a été écrit avant la migration du 3 septembre :
 * la ligne porte ses morceaux mais pas son brief, donc rouvrir
 * afficherait un écran vide en prétendant reprendre son travail. L'écran
 * le DIT au lieu de proposer un bouton qui échouerait (règle du
 * 22 août : un bouton absent se justifie sur la ligne).
 *
 * Le seuil est la PISTE pour le bonus, et le brief pour les deux autres :
 * les emails et la promo n'ont pas de piste, leur plan est fixe.
 */
export function peutEtreRepris(p: {
  generateur: string;
  projet: ProjetEnregistre | null;
}): boolean {
  if (!p.projet) return false;
  if (p.generateur === "bonus") return p.projet.piste !== null;
  return p.projet.brief.offres.length > 0;
}

/**
 * CE CONTENU MÉRITE-T-IL D'ÊTRE GARDÉ ?
 *
 * On n'enregistre pas un écran ouvert puis quitté : il remplirait la
 * bibliothèque de brouillons vides, et elle chercherait son vrai contenu
 * au milieu. Le seuil est le premier ACTE de génération, c'est à dire
 * des pistes obtenues ou un morceau écrit.
 */
export function meriteEtreGarde(p: {
  pistes: readonly unknown[];
  morceaux: readonly { markdown?: string }[];
}): boolean {
  if (p.pistes.length > 0) return true;
  return p.morceaux.some((m) => String(m?.markdown ?? "").trim().length > 0);
}
