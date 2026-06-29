// lib/db/fetchAllRows.ts
//
// Pagination serveur générique pour les fetchs qui doivent être COMPLETS
// (exports CSV/Excel, calculs lifetime) sans buter sur le plafond
// PostgREST de 1000 lignes. On boucle par pages via .range() jusqu'à
// épuisement (ou jusqu'au plafond de sécurité `max`).
//
// `makeQuery(from, to)` doit renvoyer une requête Supabase déjà filtrée
// /ordonnée à laquelle on applique .range(from, to). Exemple :
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from("quiz_leads").select("*").eq("quiz_id", id)
//       .order("created_at", { ascending: false }).range(from, to));

export async function fetchAllRows<T = Record<string, unknown>>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  opts: { pageSize?: number; max?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000;
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  const out: T[] = [];
  for (let from = 0; out.length < max; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}
