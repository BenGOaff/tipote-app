// Autosave silencieux pour les formulaires popquiz (création + édition).
//
// Comportement attendu (cf. demande Béné 2026-05-09) :
//   • L'user édite un popquiz, ferme l'onglet ou rafraîchit sans cliquer
//     "Enregistrer" → quand il revient sur la page, tout est restauré
//     tel qu'il l'avait laissé.
//   • Aucune notification : on ne dit rien à l'user, c'est juste fluide.
//   • À la sauvegarde réussie côté serveur, on nettoie la clé locale
//     pour éviter qu'un brouillon obsolète n'écrase le state hydraté
//     depuis le server.
//
// On stocke en localStorage (5-10 Mo selon le navigateur, large pour
// une vignette JPEG 720p en dataURL ≈ 200-500 Ko). Les Blob ne sont
// pas JSON-sérialisables — pour la vignette stagée on convertit en
// dataURL au moment du save et on reconvertit en Blob à l'hydratation.
//
// Clés utilisées :
//   "popquiz:autosave:new"             → page de création
//   "popquiz:autosave:edit:<popquiz_id>" → page d'édition

const PREFIX = "popquiz:autosave:";

export function autosaveKey(scope: "new" | string): string {
  return scope === "new" ? `${PREFIX}new` : `${PREFIX}edit:${scope}`;
}

/** Sérialise un état arbitraire en JSON et le stocke. Silencieux en
 *  cas d'erreur (quota dépassé, mode privé, etc.) — le pire qui peut
 *  arriver est qu'au reload l'user perde ses changements, on revient
 *  au comportement d'avant l'autosave. */
export function saveAutosave<T>(key: string, state: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // quota, private mode, etc. — silencieux.
  }
}

export function loadAutosave<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearAutosave(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // silencieux
  }
}

/** Convertit un Blob en dataURL pour le persister en localStorage.
 *  Renvoie null si Blob vide ou erreur. */
export async function blobToDataUrl(blob: Blob | null): Promise<string | null> {
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/** Reconvertit une dataURL en Blob (via fetch — supporté partout). */
export async function dataUrlToBlob(dataUrl: string | null): Promise<Blob | null> {
  if (!dataUrl) return null;
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}
