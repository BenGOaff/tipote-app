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
