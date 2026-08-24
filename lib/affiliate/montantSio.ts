// lib/affiliate/montantSio.ts
//
// LE MONTANT D'UNE VENTE SYSTEME.IO, EN CENTIMES.
//
// Systeme.io envoie tantôt `1700`, tantôt `"17.00"`, selon l'événement.
// `Number("17.00")` vaut `17` : lire le nombre au lieu du TEXTE perd
// l'information, et 17 centimes de vente donnent 6 centimes de
// commission au lieu de 6,80 €.
//
// -- POURQUOI CE FICHIER ARRIVE ICI LE 26 AOÛT -------------------------
//
// La règle existait déjà, testée, dans le dépôt Tiquiz
// (`lib/admin/sioSales.ts`, `readSioAmountCents`), avec ce commentaire :
// "je n'ai pas vérifié laquelle arrive : c'est exactement l'erreur du
// drame Ivan (raisonner sur la forme SUPPOSÉE d'un payload)".
//
// Le webhook Systeme.io de TIPOTE, lui, faisait encore
// `saleAmountCents = extractNumber(rawBody, ["order.total_price", ...])`,
// c'est à dire exactement le pari que l'autre dépôt avait retiré. Un
// garde-fou qui ne protège qu'un des deux jumeaux ne protège personne
// (leçon `pdf-parse`, 7 août).
//
// Toute évolution ici se porte dans `lib/admin/sioSales.ts` côté Tiquiz.

/** Les montants qu'on vend vraiment, en centimes. Sert à trancher. */
const MONTANTS_CONNUS = new Set([
  4700, // Atelier
  1700, 2900, 17000, 29000, // Tiquiz mensuel / mensuel+ / annuel / annuel+
  9700, 19700, 29700, 49700, // paliers Tipote historiques
]);

/**
 * Trois règles, de la plus sûre à la moins sûre :
 *
 * 1. la valeur est ÉCRITE avec des décimales -> des euros ;
 * 2. l'entier est un montant qu'on a vraiment vendu -> des centimes ;
 * 3. cet entier fois 100 est un montant vendu -> c'était des euros.
 *
 * Sinon on lit des centimes tels quels : **sous-estimer une commission
 * est moins grave que la gonfler**, parce qu'un versement parti ne
 * revient pas.
 */
export function montantSioCents(raw: unknown): number | null {
  const texte = typeof raw === "string" ? raw.trim() : String(raw ?? "");
  const brut = typeof raw === "number" ? raw : Number(texte.replace(",", "."));
  if (!Number.isFinite(brut) || brut <= 0) return null;

  if (/[.,]\d/.test(texte) || !Number.isInteger(brut)) return Math.round(brut * 100);

  const entier = Math.round(brut);
  if (MONTANTS_CONNUS.has(entier)) return entier;
  if (MONTANTS_CONNUS.has(entier * 100)) return entier * 100;
  return entier;
}
