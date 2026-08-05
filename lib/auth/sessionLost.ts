// lib/auth/sessionLost.ts
//
// Ce qu'on fait quand la session tombe pendant qu'on édite.
//
// -- POURQUOI (drame Béné, 4 août 2026) -------------------------------
//
// Elle donne ses accès à quelqu'un qui gère sa publicité. Cette
// connexion fait tourner le jeton de rafraîchissement de Supabase, donc
// l'onglet resté ouvert sur son quiz se retrouve avec un jeton périmé.
// Le renouvellement répond 400, plus rien n'est authentifié, et à
// partir de là CHAQUE appel part en 401.
//
// Rien de tout ça n'était visible. L'écran ne disait rien, le bouton
// Enregistrer ne disait rien, et la sauvegarde automatique a continué à
// réessayer une quinzaine de fois dans le vide. Elle l'a découvert dans
// la console du navigateur, avec un quiz plein de modifications non
// enregistrées et aucune idée de ce qui se passait.
//
// C'est exactement la règle écrite la veille pour le bouton Supprimer :
// **une réponse `ok: false` doit toujours produire quelque chose à
// l'écran.** Un échec silencieux coûte plus cher que la panne qu'il
// masque, parce qu'il envoie chercher au mauvais endroit.
//
// -- LES TROIS DÉCISIONS ----------------------------------------------
//
// 1. On ARRÊTE de réessayer. Une session morte ne guérit pas toute
//    seule : marteler le serveur ne sert qu'à noyer la console.
// 2. On MET LE BROUILLON À L'ABRI, en local. C'est le point le plus
//    important : jusqu'ici le brouillon ne vivait QUE sur le serveur,
//    donc au moment précis où le serveur refuse tout, le travail
//    n'existait plus nulle part.
// 3. On RAMÈNE À LA CONNEXION, en gardant où on était, pour revenir
//    directement sur le quiz une fois reconnectée.

/** Une réponse qui veut dire "tu n'es plus connectée". */
export function isSessionLost(status: number): boolean {
  return status === 401;
}

/**
 * Où envoyer quelqu'un dont la session est tombée.
 *
 * On garde le chemin courant pour revenir à l'écran exact, pas au
 * tableau de bord : rentrer et devoir retrouver son quiz après une
 * déconnexion subie, c'est une punition de plus.
 *
 * Seul un chemin INTERNE est accepté (`/quelquechose`). Une valeur
 * venue d'ailleurs (`//evil.com`, `https://evil.com`) est refusée : ce
 * paramètre finit dans une redirection, donc c'est une porte ouverte si
 * on ne la ferme pas.
 */
export function loginHrefFor(pathname: string | null | undefined): string {
  const path = String(pathname ?? "");
  const safe = /^\/(?!\/)[^\s?#]*$/.test(path) ? path : "";
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

/** Clé du brouillon de secours, par projet. */
export function draftBackupKey(projectId: string): string {
  return `tipote:draft-backup:${projectId}`;
}

export type DraftBackup = {
  savedAt: number;
  state: unknown;
};

/**
 * Met le brouillon à l'abri dans le navigateur.
 *
 * `localStorage` peut refuser (mode privé, quota plein). On avale
 * l'erreur : ce filet ne doit JAMAIS empêcher l'éditeur de fonctionner,
 * et l'appelant vérifie le retour s'il veut le dire à l'écran.
 */
export function writeDraftBackup(
  storage: Pick<Storage, "setItem"> | null | undefined,
  projectId: string,
  state: unknown,
  now: number,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(draftBackupKey(projectId), JSON.stringify({ savedAt: now, state }));
    return true;
  } catch {
    return false;
  }
}

/** Relit le brouillon de secours. `null` si absent ou illisible. */
export function readDraftBackup(
  storage: Pick<Storage, "getItem"> | null | undefined,
  projectId: string,
): DraftBackup | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftBackupKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftBackup>;
    if (!parsed || typeof parsed !== "object" || !("state" in parsed)) return null;
    return { savedAt: Number(parsed.savedAt) || 0, state: parsed.state };
  } catch {
    return null;
  }
}

export function clearDraftBackup(
  storage: Pick<Storage, "removeItem"> | null | undefined,
  projectId: string,
): void {
  if (!storage) return;
  try {
    storage.removeItem(draftBackupKey(projectId));
  } catch {
    // Sans effet : le filet n'a jamais le droit de casser l'éditeur.
  }
}
