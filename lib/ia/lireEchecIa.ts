// lib/ia/lireEchecIa.ts
//
// CÔTÉ ÉCRAN : RECONNAÎTRE UN ÉCHEC AVANT DE CHERCHER UN FLUX.
//
// Les routes de génération répondent en SSE quand tout va bien, et en
// JSON quand ça échoue. Le client testait `res.ok`, ce qui marchait tant
// que l'échec portait un 5xx... c'est à dire tant que Cloudflare mangeait
// la raison (voir `lib/ia/echecIa.ts`).
//
// LE DISCRIMINANT EST LE `Content-Type`, PAS LE STATUT. Un flux répond
// `text/event-stream`, un échec `application/json`. C'est standard, ça ne
// dépend d'aucun intermédiaire, et ça reste vrai le jour où un échec
// reprendrait un statut d'erreur.
//
// On garde `!res.ok` À CÔTÉ : les 4xx (401, 403, 404, 400) ne sont pas
// des échecs IA, ils passent intacts, et ils doivent continuer d'être
// traités comme des refus.

/** Ce que le serveur a répondu quand il n'a pas pu générer. */
export type EchecIaLu = { reason: string } | null;

/**
 * Rend la raison quand la réponse est un échec, `null` quand c'est un
 * flux exploitable.
 *
 * Ne lève JAMAIS : un corps illisible sur un chemin déjà en échec ne doit
 * pas remplacer le message par une exception. On rend alors `generic`,
 * que les 7 langues savent dire.
 */
export async function lireEchecIa(res: Response): Promise<EchecIaLu> {
  const type = res.headers.get("content-type") ?? "";
  const estJson = type.includes("application/json");
  if (res.ok && !estJson) return null;

  if (!estJson) {
    // Cloudflare a remplacé le corps, ou le serveur a rendu du texte.
    // On ne sait rien de plus, et le dire vaut mieux qu'inventer.
    return { reason: "generic" };
  }
  try {
    const json = (await res.json()) as { reason?: unknown; error?: unknown };
    const brut = typeof json.reason === "string" ? json.reason : null;
    if (brut) return { reason: brut };
    // Ancienne forme : `{ error: "..." }`. On ne la RECOPIE pas à
    // l'écran (c'est ce qui affichait "Claude API key missing on the
    // server." à une créatrice), on retombe sur une phrase traduite.
    return { reason: "generic" };
  } catch {
    return { reason: "generic" };
  }
}
