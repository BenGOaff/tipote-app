// lib/affiliate/sirene.ts
//
// LE SIREN REMPLIT LA FICHE (Béné, 27 août 2026).
//
// "On utilise tout ce qu'on peut pour limiter les risques d'erreur et
// les actions à faire."
//
// VIES répond pour les affiliés européens hors France. Or l'immense
// majorité des affiliés de Béné sont FRANÇAIS, et un Français en
// franchise en base n'a souvent aucun numéro de TVA à donner : VIES ne
// peut rien pour lui. Son SIREN, lui, existe toujours.
//
// L'annuaire des entreprises de l'État répond à partir d'un SIREN : la
// raison sociale, et l'adresse du siège découpée proprement. C'est
// public, gratuit, sans clé.
//
// -- POURQUOI ÇA COMPTE PLUS QU'UN CONFORT DE SAISIE -------------------
//
// Un profil fiscal incomplet écarte l'affilié du lot de versement
// (raison `profil-fiscal`). Il a gagné son argent, il ne le reçoit pas,
// et il faut lui écrire. Chaque champ qu'on remplit à sa place est une
// occasion de moins de rester bloqué, et une faute de frappe de moins
// sur une pièce comptable.
//
// -- ON NE REMPLACE JAMAIS UNE SAISIE ----------------------------------
//
// Ce module RENSEIGNE. Ce qu'on en fait est décidé par l'écran, qui ne
// remplit que les cases vides : quelqu'un qui a corrigé son adresse la
// semaine dernière ne doit pas la voir écrasée par un fichier de l'État.

/** Ce que l'annuaire dit d'une entreprise. Chaque champ peut manquer. */
export interface IdentiteSirene {
  denomination: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
}

const VIDE: IdentiteSirene = { denomination: null, adresse: null, codePostal: null, ville: null };

const BASE = "https://recherche-entreprises.api.gouv.fr/search";

/** L'annuaire est public et parfois lent. Une fiche n'attend pas. */
const DELAI_MAX_MS = 6000;

/**
 * Neuf chiffres, et rien d'autre.
 *
 * PURE. Accepte les espaces et les points de la saisie humaine
 * (`123 456 789`), refuse un SIRET (14 chiffres) : le SIRET désigne un
 * établissement, pas l'entreprise, et l'annuaire ne répondrait pas la
 * même chose.
 */
export function lireSiren(brut: string | null | undefined): string | null {
  const chiffres = String(brut ?? "").replace(/\D/g, "");
  return /^\d{9}$/.test(chiffres) ? chiffres : null;
}

/**
 * LE SIREN CACHÉ DANS UN NUMÉRO DE TVA FRANÇAIS.
 *
 * PURE. `FR38909349045` = `FR` + une clé de 2 caractères + les 9
 * chiffres du SIREN. La clé numérique se recalcule :
 * `(12 + 3 * (SIREN mod 97)) mod 97`, ce qui attrape la faute de frappe
 * sans aucun appel réseau.
 *
 * -- POURQUOI CETTE FONCTION EXISTE (27 août 2026) ---------------------
 *
 * Béné tape son numéro de TVA, clique Remplir, et lit "l'annuaire ne
 * répond pas". Le message était VRAI : VIES avait répondu
 * `MS_MAX_CONCURRENT_REQ`, c'est à dire que le service de l'État membre
 * était saturé. Rien dans la console, parce qu'il n'y avait pas
 * d'erreur : juste une réponse honnête et inutilisable.
 *
 * Or pour un numéro FRANÇAIS, VIES est le mauvais annuaire deux fois :
 * il est bridé en nombre d'appels, et il ne sert à rien quand SIRENE
 * répond instantanément, gratuitement, avec l'adresse déjà découpée.
 * Le SIREN étant DANS le numéro, il n'y a rien à demander à personne.
 *
 * Les vieux numéros ont une clé alphanumérique : on ne peut alors pas
 * la vérifier, mais le SIREN est là et il reste bon à prendre. Refuser
 * ces numéros écarterait des entreprises anciennes pour rien.
 */
export function sirenDepuisTvaFr(brut: string | null | undefined): string | null {
  const propre = String(brut ?? "").replace(/[\s.\-]/g, "").toUpperCase();
  const m = /^FR([0-9A-Z]{2})(\d{9})$/.exec(propre);
  if (!m) return null;
  const [, cle, siren] = m;
  if (/^\d{2}$/.test(cle)) {
    const attendue = (12 + 3 * (Number(siren) % 97)) % 97;
    if (Number(cle) !== attendue) return null;
  }
  return siren;
}

/**
 * Lit la réponse de l'annuaire.
 *
 * PURE, et volontairement méfiante : chaque champ est optionnel, et une
 * réponse qu'on ne comprend pas rend des `null`, jamais une chaîne
 * bricolée. Un formulaire à moitié rempli avec des valeurs fausses est
 * pire qu'un formulaire vide : la personne le relit moins.
 */
export function lireReponseSirene(charge: unknown): IdentiteSirene {
  if (!charge || typeof charge !== "object") return VIDE;
  const resultats = (charge as { results?: unknown }).results;
  if (!Array.isArray(resultats) || resultats.length === 0) return VIDE;
  const e = resultats[0] as Record<string, unknown>;
  const siege = (e.siege ?? {}) as Record<string, unknown>;

  const texte = (v: unknown): string | null => {
    const t = String(v ?? "").trim();
    return t || null;
  };

  const codePostal = texte(siege.code_postal);
  const ville = texte(siege.libelle_commune);

  // L'annuaire donne l'adresse ENTIÈRE, code postal et commune compris.
  // On retire la fin, sinon la ville se retrouverait écrite deux fois :
  // une dans le champ Adresse, une dans le champ Ville.
  let adresse = texte(siege.adresse);
  if (adresse && codePostal) {
    const coupe = adresse.indexOf(codePostal);
    if (coupe > 0) adresse = adresse.slice(0, coupe).trim().replace(/,$/, "") || null;
  }

  return {
    denomination: texte(e.nom_raison_sociale) ?? texte(e.nom_complet),
    adresse,
    codePostal,
    ville,
  };
}

/**
 * Demande à l'annuaire. Ne lève JAMAIS.
 *
 * `fetchImpl` est un paramètre pour que le test réponde à la place du
 * réseau : un test qui appelle vraiment l'État serait lent, dépendrait
 * d'internet, et clignoterait.
 */
export async function chercherSirene(
  siren: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<IdentiteSirene> {
  const propre = lireSiren(siren);
  if (!propre) return VIDE;
  try {
    const res = await fetchImpl(`${BASE}?q=${propre}&page=1&per_page=1`, {
      signal: AbortSignal.timeout(DELAI_MAX_MS),
    });
    if (!res.ok) return VIDE;
    return lireReponseSirene(await res.json());
  } catch {
    return VIDE;
  }
}
