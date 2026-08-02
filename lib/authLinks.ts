// lib/authLinks.ts
//
// Les liens envoyés par email doivent pointer sur NOTRE domaine, toujours.
//
// DRAME VÉRONIQUE sur Tiquiz (2 août 2026), porté ici : le flux est le
// même, donc le piège aussi.
//
// Son retour : "je demande un nouveau mot de passe,
// je clique sur le bouton, et j'arrive sur `localhost n'autorise pas la
// connexion`. Bref, je tourne en rond." Elle n'a ni proxy ni pare-feu :
// le lien lui demandait vraiment d'ouvrir un serveur qui tourne sur SON
// ordinateur, et qui n'existe pas.
//
// Pourquoi : le lien de `generateLink` passe d'abord par Supabase
// (`/auth/v1/verify?...&redirect_to=...`). Supabase ne redirige vers
// `redirect_to` que si l'URL est dans sa liste blanche ; sinon il
// retombe sur le "Site URL" du projet. Un "Site URL" resté sur
// `http://localhost:3000` (la valeur par défaut d'un projet Supabase)
// envoie donc TOUS les utilisateurs sur leur propre machine.
//
// RÈGLE : on n'envoie jamais le lien Supabase. On envoie le NÔTRE,
// construit avec le `hashed_token`, et notre page /auth/callback consomme
// le jeton elle-même (verifyOtp). Plus aucune liste blanche, plus aucun
// "Site URL" entre l'utilisateur et son compte.

/** Domaine de secours si rien d'exploitable n'est disponible. */
export const CANONICAL_APP_URL = "https://app.tipote.com";

function isUsableOrigin(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  // Une adresse locale dans un email est une impasse pour celui qui le
  // reçoit : son navigateur cherchera un serveur sur SA machine.
  // `new URL("http://[::1]:3000").hostname` vaut "[::1]", crochets
  // compris : sans les retirer, l'IPv6 locale passait au travers.
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || h.endsWith(".local")) return false;
  if (/^127\./.test(h)) return false;
  return true;
}

/**
 * URL publique, pour tout ce qui sort de l'app : liens d'email, retours
 * de paiement, adresses dans le sitemap.
 *
 * `fallback` = le domaine canonique du contexte (l'app, ou le site
 * vitrine). Le reste de la logique est commun : une adresse locale n'est
 * JAMAIS une réponse valable, quelle que soit sa provenance.
 */
export function resolvePublicUrl(
  envUrl: string | null | undefined,
  fallback: string,
  requestOrigin?: string | null,
): string {
  const trimmedEnv = (envUrl ?? "").trim().replace(/\/$/, "");
  if (isUsableOrigin(trimmedEnv)) return trimmedEnv;
  const trimmedReq = (requestOrigin ?? "").trim().replace(/\/$/, "");
  if (isUsableOrigin(trimmedReq)) return trimmedReq;
  return fallback.replace(/\/$/, "");
}

/**
 * URL publique de l'app pour un lien envoyé par email.
 *
 * Ordre : la variable d'environnement si elle est exploitable, sinon
 * l'origine de la requête en cours (le domaine par lequel l'utilisateur
 * est réellement arrivé), sinon le domaine canonique.
 *
 * Le repli sur la requête n'est pas cosmétique : c'est ce qui empêche un
 * `.env` de prod mal renseigné de partir en emails cassés.
 */
export function resolveAppUrl(
  envUrl: string | null | undefined,
  requestOrigin?: string | null,
): string {
  return resolvePublicUrl(envUrl, CANONICAL_APP_URL, requestOrigin);
}

export type AuthLinkType = "recovery" | "magiclink" | "invite" | "signup";

/**
 * Lien à mettre dans l'email : notre page de callback, avec le jeton.
 * `/auth/callback` sait déjà consommer un `token_hash` (verifyOtp) et
 * enchaîner sur le bon écran selon le type.
 */
export function buildAuthCallbackUrl(
  appUrl: string,
  params: { tokenHash: string; type: AuthLinkType },
): string {
  const base = appUrl.replace(/\/$/, "");
  const qs = new URLSearchParams({
    token_hash: params.tokenHash,
    type: params.type,
  });
  return `${base}/auth/callback?${qs.toString()}`;
}
