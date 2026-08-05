// lib/aiRetry.ts
//
// UN REFUS TEMPORAIRE D'ANTHROPIC N'EST PAS UN ÉCHEC.
//
// -- CE QUI A DÉCLENCHÉ CE FICHIER (5 août 2026) ----------------------
//
// Le journal du serveur de l'Atelier, sur un bouton de génération :
//
//   [bonus] Anthropic 529 {"type":"overloaded_error"}
//
// Rien de cassé de notre côté : l'API était saturée à cette seconde là,
// et ça se repasse en quelques secondes. En vérifiant les autres appels,
// AUCUN des dix-huit appels d'ici ne retentait. Une créatrice qui clique sur
// "Générer mon quiz" pendant une saturation reçoit donc un message
// d'erreur définitif pour une panne qui dure trois secondes, et rien ne
// lui dit que le seul geste utile est de recliquer.
//
// Même famille que le 429 de Fabienne (Atelier, 4 août) : elle lançait
// trois générations en même temps, l'API en refusait une ou deux, et
// le refus était traité comme un échec définitif. "Il peut en faire un
// ou parfois 2, mais jamais les 3." Le "parfois" est toute
// l'information : un bug de code donnerait toujours le même nombre.
//
// -- POURQUOI UN HELPER, ET PAS NEUF BOUCLES --------------------------
//
// `fetchAnthropic` remplace `fetch` et rend la MÊME `Response`, y compris
// quand elle n'est pas `ok`. Chaque appelant garde donc son traitement
// d'erreur tel quel : un seul mot change par site. Neuf boucles écrites
// à la main, ce serait neuf occasions de diverger, et c'est le défaut que
// ce repo corrige en boucle depuis juin.
//
// Le module Tiquiz est jumeau, et l'Atelier a le même
// (`lib/generate/retry.ts`, qui porte l'original).

/** Statuts qui veulent dire "reviens dans un instant", pas "c'est mort". */
export function isRetryableStatus(status: number): boolean {
  // 429 : trop d'appels à la fois. 529 : l'API est surchargée.
  // 500 / 502 / 503 / 504 : incident passager côté fournisseur.
  return status === 429 || status === 529 || (status >= 500 && status < 600);
}

/** Nombre de tentatives, la première comprise. */
export const MAX_ATTEMPTS = 3;

const BASE_DELAY_MS = 1500;
const MAX_DELAY_MS = 20_000;

/**
 * Combien attendre avant la tentative suivante.
 *
 * L'en-tête `retry-after` du fournisseur prime : lui seul sait quand sa
 * fenêtre se rouvre. Sinon on double à chaque tentative, ce qui laisse le
 * temps aux appels concurrents de finir.
 *
 * `attempt` commence à 1 (on vient de rater la première tentative).
 */
export function retryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const seconds = Number(String(retryAfterHeader ?? "").trim());
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(Math.round(seconds * 1000), MAX_DELAY_MS);
  }
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(BASE_DELAY_MS * 2 ** (n - 1), MAX_DELAY_MS);
}

/**
 * `fetch` vers Anthropic, avec les reprises qui vont bien.
 *
 * Rend la dernière `Response`, même en échec : l'appelant garde son
 * `if (!res.ok)`. Une exception réseau est retentée aussi, et relancée
 * telle quelle si toutes les tentatives échouent, pour que les `catch`
 * existants continuent de fonctionner.
 *
 * L'attente maximale ajoutée est de 4,5 secondes (1,5 puis 3), sauf si
 * le fournisseur demande davantage via `retry-after`.
 */
export async function fetchAnthropic(
  url: string,
  init: RequestInit,
  label = "anthropic",
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (!isRetryableStatus(res.status) || attempt === MAX_ATTEMPTS) return res;
      console.warn(`[${label}] Anthropic ${res.status}, reprise ${attempt}/${MAX_ATTEMPTS - 1}`);
      await sleep(retryDelayMs(attempt, res.headers.get("retry-after")));
    } catch (err) {
      lastError = err;
      // Une coupure volontaire (AbortSignal) ne se retente pas : celui
      // qui a coupé savait pourquoi, et réessayer le ferait couper
      // encore, plus tard, avec le même résultat.
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || name === "TimeoutError" || attempt === MAX_ATTEMPTS) throw err;
      console.warn(`[${label}] appel interrompu, reprise ${attempt}/${MAX_ATTEMPTS - 1}`, err);
      await sleep(retryDelayMs(attempt));
    }
  }

  throw lastError ?? new Error(`[${label}] échec après ${MAX_ATTEMPTS} tentatives`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
