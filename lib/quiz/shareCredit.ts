// lib/quiz/shareCredit.ts
//
// QUAND EST-CE QU'ON CRÉDITE UN PARTAGE, ET DONC QU'ON DÉBLOQUE LE BONUS.
//
// Signalé par une cliente le 20 août 2026 : "j'ai remarqué que le bouton
// Partage sur un réseau pour débloquer ton bonus était cliquable et
// permettait de débloquer le bonus mais sans forcément avoir partagé le
// quiz."
//
// Elle avait raison, et la cause était écrite noir sur blanc dans un
// commentaire qui affirmait le contraire :
//
//   // Web Share API (mainly mobile) — only resolves when the user
//   // actually completes the share sheet, so we can credit without
//   // heuristics.
//
// C'est FAUX, et la documentation du navigateur le dit :
//
//   "The method resolves a Promise with undefined. **On Windows this
//    happens when the share popup is launched**, while on Android the
//    promise resolves once the data has successfully been passed to the
//    share target."
//
// Sur Windows, la promesse est donc tenue **à l'ouverture de la
// fenêtre**, avant que le visiteur ait choisi quoi que ce soit. Le code
// faisait `.then(() => trackShare())` : bonus débloqué en un clic, sans
// aucun partage. Sur Android le même code est juste.
//
// -- LA VRAIE LEÇON, ET ELLE EST FAMILIÈRE ----------------------------
//
// Les trois autres chemins (boutons réseau, copie du lien) ont TOUS un
// garde-fou de durée. Un seul en était exempté, et il l'était parce
// qu'un commentaire affirmait qu'il n'en avait pas besoin. C'est mot
// pour mot le défaut du 1er août : une logique écrite pour un cas
// (Android) appliquée telle quelle à un autre (Windows), et rien ne la
// contredit avant qu'une cliente ne le découvre.
//
// D'où ce fichier : la décision sort du composant, elle devient une
// fonction pure, et **le canal est un PARAMÈTRE OBLIGATOIRE**. On ne
// peut plus créditer un partage sans avoir dit de quel chemin on parle.
//
// -- CE QU'ON NE PEUT PAS FAIRE ---------------------------------------
//
// Aucune plateforme ne nous dit "cette personne a vraiment publié". Tous
// les chemins restent des heuristiques, et quelqu'un de déterminé
// passera toujours. Ce qu'on corrige ici, c'est le cas du visiteur
// ORDINAIRE qui décroche le bonus sans rien faire, en un clic, sans même
// chercher à tricher.

/** Le temps minimum passé dans une fenêtre de partage pour y croire. */
export const MIN_SHARE_DWELL_MS = 3500;

/** Plus long pour la copie de lien : coller et publier prend plus de temps. */
export const MIN_COPY_DWELL_MS = 5000;

/** Par où le visiteur est passé. */
export type ShareChannel = "native" | "network" | "copy";

export type ShareVerdict =
  /** On débloque le bonus. */
  | "credit"
  /** Il est revenu trop vite : on l'avertit, on ne débloque pas. */
  | "too_fast"
  /**
   * On ne peut RIEN conclure de ce que le navigateur nous a dit : on
   * affiche la confirmation manuelle ("j'ai partagé") au lieu de croire
   * ou de refuser à sa place.
   */
  | "ask_confirm";

/**
 * La résolution de `navigator.share()` prouve-t-elle un partage ?
 *
 * Sur Windows, non : elle arrive à l'ouverture de la fenêtre. Partout
 * ailleurs (Android, iOS, macOS), elle arrive quand les données ont été
 * passées à la cible, ce qui est la meilleure preuve qu'on puisse avoir.
 *
 * On ne renifle donc QUE Windows, et pour une raison documentée, pas par
 * habitude. Un agent utilisateur vide ou illisible est traité comme
 * Windows : dans le doute on demande confirmation, on ne donne pas.
 */
export function nativeShareResolveIsProof(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "").trim();
  if (!ua) return false;
  // "Windows NT" couvre toutes les versions de bureau. `Windows Phone`
  // est mort depuis longtemps, et il matchait de toute façon.
  return !/Windows/i.test(ua);
}

/**
 * Faut-il créditer ce partage ?
 *
 * `elapsedMs` est le temps écoulé depuis l'ouverture de la fenêtre (ou
 * depuis la copie du lien). `resolveIsProof` ne concerne que le canal
 * natif, et vaut ce que dit `nativeShareResolveIsProof`.
 */
export function readShareCredit(input: {
  channel: ShareChannel;
  elapsedMs: number;
  /** Uniquement pour `native`. Ignoré ailleurs. */
  resolveIsProof?: boolean;
}): ShareVerdict {
  const ecoule = Number.isFinite(input.elapsedMs) ? Math.max(0, input.elapsedMs) : 0;

  if (input.channel === "copy") {
    return ecoule >= MIN_COPY_DWELL_MS ? "credit" : "too_fast";
  }

  if (input.channel === "network") {
    return ecoule >= MIN_SHARE_DWELL_MS ? "credit" : "too_fast";
  }

  // ── Le canal natif, celui qui donnait le bonus pour rien ──
  //
  // Là où la résolution vaut preuve, on crédite comme avant : le
  // parcours mobile ne gagne pas un clic de plus, et c'est le plus gros
  // du trafic.
  if (input.resolveIsProof === true) return "credit";

  // Sur Windows, la résolution ne dit rien. Si le visiteur est quand
  // même resté assez longtemps, on lui fait crédit comme pour un bouton
  // réseau. Sinon on ne refuse PAS : on lui demande de confirmer, parce
  // que quelqu'un qui a vraiment partagé ne doit pas perdre son bonus à
  // cause d'une particularité de son navigateur.
  if (ecoule >= MIN_SHARE_DWELL_MS) return "credit";
  return "ask_confirm";
}
