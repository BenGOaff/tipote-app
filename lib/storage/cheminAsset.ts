// lib/storage/cheminAsset.ts
//
// OÙ UN FICHIER TÉLÉVERSÉ A LE DROIT D'ATTERRIR.
//
// Béné, 26 août 2026 : "il faut identifier ce qui prend de la place et
// mettre un max de trucs sur le serveur au lieu de supabase pour
// économiser de la place et éviter de dépasser les limites."
//
// Servir les images depuis notre serveur veut dire ÉCRIRE des fichiers
// sur notre disque à partir de ce qu'envoie un navigateur. C'est le
// moment le plus dangereux de toute la chaîne, et c'est pour ça que la
// décision vit ici, en fonction pure et testée, plutôt que dans la
// route qui manipule le système de fichiers.
//
// -- LES TROIS CHOSES QU'UN CHEMIN REÇU PEUT FAIRE DE MAL --------------
//
// 1. **Sortir du dossier** (`../../etc/passwd`, `/absolu`, `..\\` sous
//    Windows). On écrirait alors n'importe où sur le serveur.
// 2. **Écrire chez quelqu'un d'autre.** Les chemins portent l'identité :
//    `logos/<userId>/...`. Sans contrôle, une créatrice pourrait
//    remplacer le logo d'une autre.
// 3. **Se faire exécuter.** Un `.php`, un `.html` ou un `.svg` servi
//    depuis notre domaine s'exécute dans le navigateur du visiteur, avec
//    nos cookies. nginx les refuse déjà, mais un fichier qui n'aurait
//    jamais dû être écrit est un fichier de trop.
//
// La règle est donc une LISTE BLANCHE, jamais une liste noire : on
// n'accepte que ce qu'on sait nommer. Une liste noire oublie toujours la
// prochaine extension.

/** Les dossiers de tête qu'on accepte. Un dossier inconnu est refusé. */
export const DOSSIERS_ASSETS = [
  "bonus",
  "cropped",
  "favicons",
  "logos",
  "og",
  "quiz-backgrounds",
  "quiz-options",
  "quiz-panel",
  "quiz-questions",
  "rich-content",
  "studio",
] as const;

/**
 * Les extensions qu'une image peut porter. Rien d'autre n'est écrit.
 *
 * **`svg` en est ABSENT, et c'est une décision.** Un SVG est un document
 * qui peut porter du script, et il serait servi depuis un domaine à
 * nous. `ico` y est, lui : c'est une image, elle n'exécute rien, et
 * c'est un format de favicon que les créatrices envoient vraiment
 * (`prepareFaviconForUpload` le laisse passer tel quel).
 *
 * Une extension refusée ne perd JAMAIS l'envoi : `televerserAsset`
 * retombe sur Supabase, exactement comme avant.
 */
export const EXTENSIONS_ASSETS = ["webp", "png", "jpg", "jpeg", "gif", "avif", "ico"] as const;

export type RefusChemin =
  | "dossier_inconnu"
  | "pas_le_bon_proprietaire"
  | "extension_refusee"
  | "forme_invalide";

export type VerdictChemin =
  | { ok: true; chemin: string }
  | { ok: false; raison: RefusChemin };

/**
 * VALIDE UN CHEMIN DEMANDÉ, pour un utilisateur donné.
 *
 * `chemin` est ce que le navigateur propose, `userId` vient de la
 * SESSION côté serveur, jamais du corps de la requête. C'est ce qui
 * rend impossible d'écrire chez quelqu'un d'autre.
 *
 * Rend le chemin NETTOYÉ, qui peut différer de celui reçu : c'est celui
 * là qu'il faut écrire, jamais l'original.
 */
export function validerCheminAsset(chemin: unknown, userId: unknown): VerdictChemin {
  const brut = String(chemin ?? "").trim();
  const proprietaire = String(userId ?? "").trim();
  if (!brut || !proprietaire) return { ok: false, raison: "forme_invalide" };

  // On refuse AVANT de découper : un `\` ou un `%2e%2e` n'a rien à faire
  // dans un chemin qu'on a fabriqué nous mêmes, donc sa présence est
  // déjà le signe qu'on ne parle pas au bon interlocuteur.
  if (brut.includes("\\") || brut.includes("%") || brut.startsWith("/")) {
    return { ok: false, raison: "forme_invalide" };
  }

  const morceaux = brut.split("/");
  if (morceaux.length < 3) return { ok: false, raison: "forme_invalide" };

  // Aucun segment vide, aucun segment relatif. `..` seul suffirait à
  // remonter d'un cran, et `.` à brouiller la comparaison.
  for (const m of morceaux) {
    if (!m || m === "." || m === "..") return { ok: false, raison: "forme_invalide" };
  }

  const [dossier, id, ...reste] = morceaux;
  if (!(DOSSIERS_ASSETS as readonly string[]).includes(dossier)) {
    return { ok: false, raison: "dossier_inconnu" };
  }
  // LA COMPARAISON QUI COMPTE. `userId` vient de la session.
  if (id !== proprietaire) return { ok: false, raison: "pas_le_bon_proprietaire" };

  const nom = reste[reste.length - 1];
  const point = nom.lastIndexOf(".");
  const ext = point > 0 ? nom.slice(point + 1).toLowerCase() : "";
  if (!(EXTENSIONS_ASSETS as readonly string[]).includes(ext)) {
    return { ok: false, raison: "extension_refusee" };
  }

  // Chaque segment est réduit à un alphabet sans surprise. Un nom exotique
  // n'est pas refusé, il est NETTOYÉ : refuser ferait perdre un envoi à
  // une créatrice pour un accent dans un nom de fichier.
  const propre = morceaux
    .map((m) => m.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-{2,}/g, "-"))
    .join("/");

  return { ok: true, chemin: propre };
}

/**
 * L'ADRESSE PUBLIQUE D'UN FICHIER SERVI PAR NOTRE SERVEUR.
 *
 * `base` est validée, jamais prise telle quelle : un `??` ne protège que
 * de la variable ABSENTE, jamais de la variable FAUSSE (drame Véronique,
 * 2 août : `NEXT_PUBLIC_APP_URL` valait `localhost` en production, et
 * tous les liens envoyés par email pointaient sur la machine de celui
 * qui les recevait).
 *
 * Ici l'enjeu est le même en pire : une base fausse écrirait des URL
 * mortes DANS la base de données, sur des quiz publiés. Elles y
 * resteraient après correction de la variable.
 *
 * Rend `null` quand la base n'est pas utilisable : l'appelant doit alors
 * retomber sur Supabase, pas fabriquer une adresse au hasard.
 */
export function baseAssetsValide(brut: unknown): string | null {
  const v = String(brut ?? "").trim().replace(/\/+$/, "");
  if (!v) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.startsWith("127.") || h === "::1") return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

/** L'URL publique complète d'un chemin, ou `null` si l'hébergement local n'est pas configuré. */
export function urlAssetLocal(chemin: string, base: unknown): string | null {
  const b = baseAssetsValide(base);
  if (!b) return null;
  return `${b}/${chemin.split("/").map(encodeURIComponent).join("/")}`;
}
