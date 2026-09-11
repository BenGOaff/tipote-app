// tests/logic/aide/sansCommentaires.mts
//
// RETIRER LES COMMENTAIRES D'UNE SOURCE, DANS LE BON ORDRE (8 septembre
// 2026).
//
// Un test qui mesure la PRESENCE ou l'ORDRE de quelque chose dans un
// fichier doit d'abord retirer les commentaires : sinon il tombe sur sa
// propre explication, et il rougit (ou passe) pour la mauvaise raison.
// Cette regle est ecrite dans AGENTS.md depuis le 3 septembre, et vingt
// fichiers de test la recopiaient chacun a leur facon.
//
// L'ORDRE EST LA SEULE CHOSE QUI COMPTE ICI, ET IL ETAIT FAUX PARTOUT.
// La version recopiee retirait les blocs `/* ... */` EN PREMIER :
//
//     .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ")
//
// Or une ligne `//` peut tres bien CONTENIR `/*`, et c'est le cas des
// qu'un commentaire cite un chemin avec un joker. Mesure du 8 septembre
// sur `app/(site-langues)/integrations/page.tsx` :
//
//   ligne  35 : // vit dans `lib/site/outils/*.ts`, une entree par langue
//   ligne 172 : ... le rend invisible pour eux. */}
//
// Le motif de bloc s'ouvrait donc a la ligne 35 et se fermait a la 172 :
// il avalait 137 lignes de CODE, dont l'appel `contenuHub(` que le test
// exigeait. 11126 octets -> 4168, et le test rougissait sur une page
// parfaitement correcte.
//
// La correction est l'ORDRE : on retire les lignes `//` D'ABORD, donc le
// `/*` qu'elles portent disparait avec elles. Un `//` a l'interieur d'un
// vrai bloc `/* ... */` n'y change rien : le bloc reste appariable apres
// que ses lignes `//` ont saute.
//
// Et 14 fichiers du depot portent aujourd'hui ce motif (mesure, pas
// suppose) : middleware.ts, next.config.ts, pagesPubliques.ts,
// QuizDetailClient.tsx... Le danger n'est pas seulement un test qui
// rougit a tort : une assertion NEGATIVE ("la page ne contient pas X")
// passe au VERT pour toujours quand le code a ete avale. C'est
// exactement la panne silencieuse que ce depot paie en boucle.

/**
 * La source sans ses commentaires, remplaces par une ESPACE : deux
 * identifiants separes par un commentaire ne doivent pas se coller.
 */
export function sansCommentaires(code: string): string {
  return code
    .replace(/^[ \t]*\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}
