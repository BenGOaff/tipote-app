// lib/affiliate/lienDecouverte.ts
//
// LE LIEN "OFFERT PAR TIQUIZ", ET IL N'EXISTE QU'ICI.
//
// Béné, 26 août 2026 : "tiens un truc que je suis presque sûre que t'as
// oublié : le lien affilié intégré dans les textes de bas de page d'un
// quiz ou encore sur le qr code d'un certificat... il faut penser à TOUT
// et ne RIEN laisser au hasard."
//
// Elle avait raison. Cette même fonction était recopiée à TROIS
// endroits, dans deux dépôts : le pied de page des quiz publics, celui
// des popquiz et de leur embed, et le pied de page des quiz de Tipote.
// Le 26 août au matin, un seul des trois a été corrigé. Les deux autres
// ont continué d'envoyer sur `tipote.fr/part-tiquiz` : un tunnel
// Systeme.io, qui ne nous transmet RIEN de ce qu'on ajoute à l'URL.
//
// C'est très exactement la mécanique de "une URL écrite en dur à deux
// endroits ne se corrige jamais qu'à moitié" (drame de l'Atelier,
// 3 août), et elle vient de se rejouer sur le lien le PLUS VU de tout
// le système : il est en bas de chaque quiz publié en gratuit.
//
// -- POURQUOI ÇA PORTE ENCORE UN `?sa=` -------------------------------
//
// Nos liens publics portent `?ref=` depuis le 24 août. Ici, la seule
// chose qu'on connaisse du créateur est son identifiant Systeme.io,
// celui qu'il a rempli dans ses réglages : c'est ce champ là, et pas un
// autre, qui pilote ce pied de page. On envoie donc ce qu'on a.
//
// Corollaire assumé, et il ne change pas : ce chemin n'ouvre PAS le
// mois offert, réservé aux liens `?ref=` fabriqués par l'espace
// affilié. Le nom du paramètre suffit à le décider, sans aucun marqueur
// à maintenir.

/** Notre page de vente. Un tunnel Systeme.io ne transmet pas la query. */
export const TIQUIZ_DECOUVERTE_URL = "https://tiquiz.fr/";

/**
 * Le lien du pied de page, tracké quand le créateur a posé son
 * identifiant affilié dans ses réglages.
 *
 * Sans identifiant, on rend quand même l'adresse : ce pied de page est
 * une porte d'entrée vers le produit avant d'être une commission, et un
 * lien absent ne rapporterait rien à personne.
 */
export function tiquizDiscoveryUrl(affiliateId: string | null | undefined): string {
  const sa = String(affiliateId ?? "").trim();
  if (!sa) return TIQUIZ_DECOUVERTE_URL;
  return `${TIQUIZ_DECOUVERTE_URL}?sa=${encodeURIComponent(sa)}`;
}
