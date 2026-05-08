// lib/compta/forex.ts
//
// Conversion de devises vers EUR via frankfurter.app (gratuit,
// open data BCE, pas de clé API). Utilisé pour le dashboard compta
// quand l'user a des transactions en USD / GBP / etc.
//
// Stratégie : un seul appel par run (pour les currencies présentes
// chez l'user) et cache en mémoire 1h. Si frankfurter ne répond pas,
// on retombe sur "1:1 = on traite la valeur comme déjà en EUR" et
// on signale dans la réponse API que les rates n'ont pas pu être
// récupérés (pour que l'UI affiche un warning).
//
// Limitation assumée : on utilise le taux du JOUR pour TOUTES les
// transactions, pas le taux historique de chaque transaction. Pour un
// dashboard "anticiper sa compta" c'est suffisant ; si l'user veut
// un chiffre exact pour sa déclaration, il fait sa conversion au taux
// du jour de chaque vente côté livre des recettes.

import "server-only";

const FRANKFURTER_LATEST = "https://api.frankfurter.app/latest";
const TTL_MS = 60 * 60 * 1000; // 1h

let cache: { rates: Record<string, number>; fetchedAt: number } | null = null;

/** Récupère les taux EUR → autres devises pour la liste demandée.
 *  Cache 1h en mémoire serveur. Si frankfurter foire, retourne un
 *  objet vide → la conversion fallback à 1:1 et l'UI affiche un
 *  warning "taux indisponibles".
 *
 *  Le format renvoyé est "1 EUR = N currency" (ex: rates.USD = 1.08).
 *  Pour convertir un montant en `currency` vers EUR, faire :
 *    eurAmount = nonEurAmount / rates[currency]
 *  Le helper `convertToEurCents` ci-dessous fait exactement ça.
 */
export async function getEurForexRates(
  neededCurrencies: ReadonlyArray<string>,
): Promise<{ rates: Record<string, number>; fetchedAt: string | null }> {
  const distinct = [...new Set(neededCurrencies)]
    .map((c) => c.toUpperCase())
    .filter((c) => c && c !== "EUR");

  if (distinct.length === 0) {
    return { rates: {}, fetchedAt: cache ? new Date(cache.fetchedAt).toISOString() : null };
  }

  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    if (distinct.every((c) => c in cache!.rates)) {
      return {
        rates: cache.rates,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
      };
    }
  }

  // (Re)fetch
  try {
    const url = `${FRANKFURTER_LATEST}?from=EUR&to=${distinct.join(",")}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn("[forex] Frankfurter HTTP", res.status);
      return { rates: cache?.rates ?? {}, fetchedAt: cache ? new Date(cache.fetchedAt).toISOString() : null };
    }
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rates = json.rates ?? {};
    cache = { rates, fetchedAt: now };
    return { rates, fetchedAt: new Date(now).toISOString() };
  } catch (e) {
    console.warn("[forex] fetch error:", e instanceof Error ? e.message : e);
    return { rates: cache?.rates ?? {}, fetchedAt: cache ? new Date(cache.fetchedAt).toISOString() : null };
  }
}

/** Convertit un montant en cents d'une devise X vers cents EUR.
 *  Si la devise est EUR ou si le taux est manquant (frankfurter foire),
 *  on retourne le montant tel quel — flag de fallback à remonter dans
 *  l'UI si on a vraiment besoin d'un signal.
 */
export function convertToEurCents(
  amountCents: number,
  currency: string,
  rates: Record<string, number>,
): number {
  const c = (currency || "EUR").toUpperCase();
  if (c === "EUR") return amountCents;
  const rate = rates[c];
  if (!rate || rate === 0) return amountCents;
  // rate = "1 EUR = N currency" → 1 currency = 1/rate EUR
  return Math.round(amountCents / rate);
}
