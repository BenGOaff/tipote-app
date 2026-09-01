// lib/affiliate/visitCookie.ts
//
// LE COOKIE QU'ON POSE NOUS-MÊMES, SUR NOTRE DOMAINE.
//
// -- CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS ENCORE ---------------------
//
// Il faut être précis, parce que le plan a été trop optimiste sur ce
// point et que la moitié des bénéfices annoncés n'arrive qu'en phase 3.
//
// Ce cookie est posé par la redirection `/go/...`, donc sur
// `affiliate.tipote.com`. Or les pages de vente vivent sur `tipote.fr`,
// un DOMAINE DIFFÉRENT (pas un sous-domaine : tipote.com et tipote.fr
// sont deux enregistrements distincts). Un cookie posé chez nous n'est
// donc PAS envoyé aux pages Systeme.io.
//
// Ce que la redirection apporte DÈS MAINTENANT :
//   - le clic est compté côté serveur, donc plus de snippet à casser en
//     modifiant une page de vente, et plus rien qu'un bloqueur puisse
//     couper ;
//   - le canal et la provenance sont connus, ce que le snippet ne
//     donnait pas ;
//   - un lien lisible et un lien court, tous deux à nous.
//
// Ce que ce cookie servira EN PHASE 3, quand la vente se fera chez nous :
//   - reconnaître le visiteur au moment du paiement, donc attribuer la
//     vente sans passer par la correspondance d'email, qui rate dès que
//     le client paie avec une autre adresse que celle de son optin.
//
// D'ici là, l'attribution continue de passer par `?sa=` sur la page de
// vente et par la correspondance d'email : la redirection le propage,
// rien ne change pour les ventes en cours.

/** Nom du cookie de visite affiliée. */
export const VISIT_COOKIE = "tipote_aff";

/**
 * 90 jours, comme la fenêtre d'attribution du programme.
 *
 * Les deux durées doivent rester ÉGALES : un cookie plus court perdrait
 * des ventes que la règle dit attribuables, un cookie plus long
 * promettrait une attribution que la règle refuse. Deux durées écrites
 * séparément finissent toujours par diverger.
 */
export const VISIT_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export type VisitCookie = {
  /** Le code public de l'affilié. */
  ref: string;
  /** Le tag posée par l'affilié, si son lien en portait une. */
  channel: string | null;
  /** Le lien exact emprunté, pour rattacher la vente au bon lien. */
  linkId: string | null;
};

/**
 * Sérialise la visite.
 *
 * Format plat `ref|channel|linkId`, pas du JSON : un cookie se lit dans
 * des journaux et se recopie à la main pendant un diagnostic, et du JSON
 * encodé en URL y est illisible. Les valeurs sont déjà nettoyées
 * (`sanitizeRef`, `sanitizeChannel`, un UUID), donc aucune ne peut
 * contenir le séparateur.
 */
export function serializeVisit(visit: VisitCookie): string {
  return [visit.ref, visit.channel ?? "", visit.linkId ?? ""].join("|");
}

/**
 * Relit la visite.
 *
 * Fail-open : une valeur illisible rend `null` au lieu de lever. Un
 * cookie abîmé ne doit jamais empêcher un visiteur d'accéder à la page
 * de vente, il doit juste ne rien attribuer.
 */
export function parseVisit(raw: string | null | undefined): VisitCookie | null {
  const brut = String(raw ?? "").trim();
  if (!brut) return null;
  const [ref, channel, linkId] = brut.split("|");
  if (!ref) return null;
  return {
    ref,
    channel: channel || null,
    linkId: linkId || null,
  };
}
