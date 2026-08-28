// lib/affiliate/conditionsUrl.ts (Tipote)
//
// L'ADRESSE DES CONDITIONS DU PROGRAMME VIT ICI, ET NULLE PART AILLEURS.
//
// Elle était écrite en dur à TROIS endroits de l'espace affilié, et pas
// avec la même valeur : le tableau de bord menait à la page maintenue
// (`quiz.tipote.com/affiliate`, rendue depuis `lib/legal/affiliate.ts`),
// pendant que Promouvoir et Support menaient à une page Systeme.io figée
// depuis des mois. Un affilié y lisait donc un cookie sans durée, un
// versement fait par Systeme.io et aucun seuil, alors que le programme
// annonce 12 mois, un virement fait par nous et un minimum de 20 euros.
//
// Deux textes juridiques pour un seul programme finissent toujours par se
// contredire, et c'est celui qu'il a lu qui l'engage.
//
// INTERDIT : réécrire une URL de conditions dans un composant.

/** Langues dans lesquelles le texte des conditions EXISTE vraiment
 *  (`lib/legal/affiliate.ts` côté Tiquiz). Le portugais n'y est pas :
 *  demander `?lang=pt` sert la version anglaise en silence. On ne
 *  l'envoie donc pas, ce qui revient au même mais sans prétendre. */
const LANGUES_DES_CONDITIONS = ["fr", "en", "es", "it", "ar"] as const;

const BASE = "https://quiz.tipote.com/affiliate";

/**
 * L'adresse des conditions générales du programme d'affiliation, dans la
 * langue de l'affilié quand elle existe.
 */
export function conditionsAffiliationUrl(locale?: string | null): string {
  const code = String(locale ?? "").slice(0, 2).toLowerCase();
  const connue = (LANGUES_DES_CONDITIONS as readonly string[]).includes(code);
  return connue ? `${BASE}?lang=${code}` : BASE;
}
