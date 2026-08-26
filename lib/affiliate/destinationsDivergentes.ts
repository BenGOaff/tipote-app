// lib/affiliate/destinationsDivergentes.ts
//
// LA BASE CONTREDIT-ELLE LE CODE ?
//
// -- POURQUOI CE FICHIER EXISTE À PART (26 août 2026) ------------------
//
// `linkDestinations.ts` importe `supabaseAdmin`, qui exige ses variables
// d'environnement au CHARGEMENT. Aucun test ne peut donc l'importer, et
// c'est très exactement là que le défaut s'est installé : le seed
// pointait sur nos domaines depuis le 25 août, la base sur les tunnels
// Systeme.io depuis le 8 juin, et rien nulle part ne comparait les deux.
//
// Béné l'a découvert en regardant son propre espace affilié : ses liens
// menaient chez Systeme.io, qui ne nous transmet pas le `?ref=`. La
// vente arrivait, et personne n'était payé.
//
// C'est le même piège que le verrou des webhooks (24 août) : une
// décision enfermée dans un module qui tire la base n'est pas testable,
// donc elle n'est pas testée, donc c'est là que les bugs vivent.
//
// -- LA LISTE ATTENDUE EST UN PARAMÈTRE --------------------------------
//
// Elle n'est pas lue ici : on la reçoit. Le test peut donc décrire le
// cas exact qu'il veut, et la fonction ne dépend de rien.

export type DestinationLue = { slug: string; path: string };

export type Divergence = { slug: string; enBase: string; attendu: string };

/**
 * Les destinations dont la base ne dit pas ce que le code attend.
 *
 * Une destination dont le chemin attendu reste RELATIF est ignorée :
 * c'est l'optin gratuit, qui reste chez Systeme.io délibérément. La
 * signaler ferait crier le contrôle pour rien, et un contrôle qui crie
 * pour rien finit désactivé.
 */
export function destinationsDivergentes(
  enBase: ReadonlyArray<DestinationLue>,
  attendues: ReadonlyArray<DestinationLue>,
): Divergence[] {
  const sortie: Divergence[] = [];
  for (const r of enBase) {
    const attendu = attendues.find((f) => f.slug === r.slug);
    if (!attendu || attendu.path === r.path) continue;
    if (!/^https:\/\//i.test(attendu.path)) continue;
    sortie.push({ slug: r.slug, enBase: r.path, attendu: attendu.path });
  }
  return sortie;
}
