// lib/affiliate/saFormat.ts
//
// LA FORME D'UN IDENTIFIANT D'AFFILIÉE, ÉCRITE UNE SEULE FOIS.
//
// Elle vivait en QUATRE exemplaires (`attribute-sale`, `track`,
// l'inscription affiliée, et maintenant `proprietaire`). Elles ne
// disaient pas encore des choses différentes, mais c'est exactement
// ainsi que commence une divergence : le jour où Systeme.io allonge ses
// identifiants, trois endroits l'acceptent et le quatrième le refuse,
// et la commission se perd là où personne ne regarde.
//
// `sa` finit dans une requête SQL et dans un versement : on ne garde que
// ce qui a EXACTEMENT la forme d'un identifiant Systeme.io, et tout le
// reste est jeté sans bruit. Une valeur inventée ne doit pas pouvoir
// créer une ligne au nom de personne.

/** Format Systeme.io : "sa" + 20 à 80 caractères hexadécimaux. */
export const SA_RE = /^sa[a-f0-9]{20,80}$/i;

/** Rend le `sa` s'il est utilisable, `null` sinon. Jamais d'exception. */
export function lireSa(brut: unknown): string | null {
  const v = typeof brut === "string" ? brut.trim() : "";
  return SA_RE.test(v) ? v : null;
}

// ── RECRUTER SANS COMPTE SYSTEME.IO (Béné, 25 août 2026) ────────────
//
// "On est censés avoir NOTRE système d'affiliation ? Du coup pourquoi un
// type sans systeme io ne pourrait pas devenir affilié chez nous ??"
//
// Il ne pouvait pas, et la cause n'était pas la base : `affiliates.sa`
// est une colonne `text`, elle accepte n'importe quoi. C'était le
// FORMULAIRE et les contrôles : le `sa` était obligatoire, et il devait
// avoir la forme d'un identifiant Systeme.io.
//
// La sortie la moins risquée est de FABRIQUER un identifiant à la même
// forme. Ce `sa` est la clé primaire de la table, et toutes les autres
// (clics, conversions, commissions, versements) y font référence :
// changer sa forme, c'est toucher à chacun de ces contrôles, dans les
// trois dépôts, pour ne rien gagner. 32 caractères hexadécimaux tirés au
// hasard : une collision avec un identifiant Systeme.io existant est
// hors de portée, et tout le code écrit depuis mai continue de marcher
// sans une ligne de changement.
//
// EN REVANCHE, ON NE DEVINE PAS L'ORIGINE À LA FORME. C'est la colonne
// `affiliates.origin` qui dit d'où vient un affilié, parce que ça
// change ce qu'on peut lui promettre : ses ventes arrivées par un
// ancien tunnel Systeme.io ne lui seront jamais attribuées, et
// l'Atelier, qui tient son PROPRE registre, ne le connaît pas.
// Déduire à la forme marcherait aujourd'hui et casserait le jour où
// Systeme.io change la sienne (leçon du `?ref=` contre le `?sa=`).

/** D'où vient l'identifiant d'un affilié. */
export type AffiliateOrigin = "systeme_io" | "tipote";

/**
 * Fabrique un identifiant d'affiliée maison.
 *
 * `crypto.randomUUID()` plutôt qu'un compteur : deux inscriptions
 * simultanées ne doivent pas pouvoir produire le même identifiant, et
 * un identifiant devinable laisserait quelqu'un fabriquer un lien au
 * nom d'une autre.
 */
export function genererSa(): string {
  const hex = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  return `sa${hex.slice(0, 32)}`;
}
