// lib/dateKeys.ts
//
// SOURCE DE VÉRITÉ UNIQUE pour le bucketing par jour des time-series
// stats (leads/events sur N jours). Avant, chaque surface bucketisait
// à sa sauce (UTC ici, local là, mix ailleurs) → "aujourd'hui" pouvait
// apparaître vide quand un lead tombait de l'autre côté de minuit UTC.
// Bug remonté plusieurs fois (Adeline 24/05 : 6 leads aujourd'hui mais
// rien sur le graphe 30 jours). Cf. CLAUDE_PITFALLS section V.
//
// RÈGLE : on bucketise TOUJOURS selon le jour LOCAL du créateur qui
// regarde ses stats — pas UTC. "Aujourd'hui" = son aujourd'hui à lui.
//   - Côté client (graphe rendu dans le navigateur) : localDateKey()
//     utilise directement le fuseau du navigateur.
//   - Côté serveur (agrégation API) : le client passe son offset via
//     `new Date().getTimezoneOffset()` et le serveur bucketise avec
//     dateKeyForOffset() pour retomber sur les mêmes jours locaux.

/** YYYY-MM-DD dans le fuseau local du runtime courant. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * YYYY-MM-DD d'un instant `d`, exprimé dans le fuseau dont l'offset
 * (minutes, convention JS `getTimezoneOffset` : positif = derrière
 * UTC, ex Paris été = -120) est passé. Permet au serveur de
 * bucketiser dans le fuseau local du client.
 */
export function dateKeyForOffset(d: Date, offsetMinutes: number): string {
  // getTimezoneOffset = (UTC - local) en min. Pour passer de l'instant
  // UTC à l'heure murale locale du client, on retire l'offset.
  const shifted = new Date(d.getTime() - offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse un offset depuis une query string, borné au raisonnable
 *  (±14h). Retourne 0 (UTC) si absent / invalide. */
export function parseTzOffset(raw: string | null): number {
  if (raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > 14 * 60) return 0;
  return Math.trunc(n);
}
