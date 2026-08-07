// lib/affiliate/urls.ts
//
// LES ADRESSES DU PROGRAMME D'AFFILIATION VIVENT ICI, ET NULLE PART
// AILLEURS.
//
// Béné, 6 août 2026 : "tu dois mettre le lien de
// https://affiliate.tipote.com/ et sur l'accueil d'affiliate : le lien
// d'inscription pour ceux qui veulent voir l'espace affilié :
// https://www.tipote.fr/tiquiz/affiliation, comme ça ils peuvent
// s'inscrire directement."
//
// -- CE QU'ON CORRIGE --------------------------------------------------
//
// Le bouton "Pas encore affilié ? Découvrir le programme" de l'écran de
// connexion pointait vers les CONDITIONS GÉNÉRALES. Quelqu'un qui arrive
// sur affiliate.tipote.com sans compte lisait donc un texte juridique au
// lieu de pouvoir s'inscrire. C'est un cul-de-sac posé à l'endroit exact
// où on perd le plus de monde : la personne est venue exprès.
//
// -- ET POURQUOI UN FICHIER POUR DEUX CONSTANTES -----------------------
//
// L'adresse du tableau de bord était déjà écrite en dur à DEUX endroits
// (le webhook Systeme.io et l'envoi de lien magique), les deux fois sous
// la forme `process.env.X ?? "https://affiliate.tipote.com"`.
//
// C'est le motif exact du drame de l'Atelier du 3 août : une URL écrite
// en dur à deux endroits ne se corrige jamais qu'à moitié. Et le `??`
// est un faux garde-fou, déjà démontré par le drame Véronique du 2 août :
// il ne protège que de la variable ABSENTE, jamais de la variable FAUSSE.
// Une variable d'environnement présente et vide, ou pointant vers
// localhost, traversait tout et se retrouvait dans un email.

/** L'adresse canonique, celle qui gagne quand la surcharge est douteuse. */
const DASHBOARD_CANONICAL = "https://affiliate.tipote.com";

/**
 * La page qui EXPLIQUE le programme et permet de s'y inscrire.
 *
 * Ce n'est pas la page des conditions générales : celle-là répond à
 * "qu'est-ce que je signe", pas à "comment je commence".
 */
export const AFFILIATE_SIGNUP_URL = "https://www.tipote.fr/tiquiz/affiliation";

/**
 * Le tableau de bord affilié.
 *
 * La surcharge par variable d'environnement reste possible (utile en
 * préproduction), mais elle est VALIDÉE : une valeur vide, non-https ou
 * locale retombe sur le domaine canonique. Sinon un `.env` mal renseigné
 * envoie des liens cassés à de vrais affiliés, par email, sans que rien
 * ne le signale.
 */
export function affiliateDashboardUrl(): string {
  const brut = (process.env.AFFILIATE_DASHBOARD_URL ?? "").trim();
  if (!brut) return DASHBOARD_CANONICAL;
  try {
    const u = new URL(brut);
    if (u.protocol !== "https:") return DASHBOARD_CANONICAL;
    const h = u.hostname.toLowerCase();
    const locale =
      h === "localhost" ||
      h === "::1" ||
      h.startsWith("127.") ||
      h.endsWith(".local");
    if (locale) return DASHBOARD_CANONICAL;
    return u.origin;
  } catch {
    return DASHBOARD_CANONICAL;
  }
}
