// lib/sales/servePage.ts
//
// SERVIR UNE PAGE DE VENTE DEPUIS NOTRE SERVEUR.
//
// La page est servie TELLE QUELLE, document complet, en dehors du rendu
// React. C'est ce qui garantit le rendu identique : son CSS vise des
// identifiants précis (`#row-636faa3d`, `#section-ac141c59`) et vit dans
// 47 blocs de style. Toute tentative de la "reconstruire proprement"
// voudrait dire réécrire 190 Ko de CSS, avec une dérive visuelle
// garantie et aucun bénéfice.
//
// Ce qu'on INJECTE, en revanche, doit passer par ici et nulle part
// ailleurs : le référencement, le lien de commande, le suivi affilié.

/** Ce qu'on sait d'une page de vente, indépendamment de son HTML. */
export type SalesPageMeta = {
  slug: string;
  /** L'adresse canonique une fois en ligne. */
  canonical: string;
  title: string;
  description: string;
  /** L'image de partage, chemin absolu sur notre domaine. */
  ogImage?: string;
  /** La langue de la page, pour `<html lang>`. */
  locale: string;
};

/**
 * Retire du HTML capturé les balises que NOUS allons réécrire.
 *
 * Sans ce nettoyage, la page porterait deux titres, deux descriptions et
 * deux canoniques : les moteurs choisissent alors eux-mêmes, et on perd
 * la maîtrise de ce qui s'affiche dans les résultats.
 */
export function stripHeadTags(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta[^>]*name=["']?description["']?[^>]*>/gi, "")
    .replace(/<meta[^>]*property=["']og:[^"']*["'][^>]*>/gi, "")
    .replace(/<meta[^>]*name=["']twitter:[^"']*["'][^>]*>/gi, "")
    .replace(/<link[^>]*rel=["']?canonical["']?[^>]*>/gi, "");
}

/** Échappe ce qui part dans un attribut HTML. */
function attr(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Les balises de référencement, écrites par nous.
 *
 * Béné, 19 août : "il faudra aussi optimiser le référencement à chaque
 * étape pour que ces pages rankent correctement." Le minimum qui compte
 * vraiment, et rien de décoratif :
 *
 *   - un TITRE et une DESCRIPTION maîtrisés ;
 *   - une CANONIQUE, indispensable ici : la même page existera un temps
 *     sur tipote.fr ET chez nous, et sans canonique les deux se font
 *     concurrence sur les mêmes mots ;
 *   - les balises de partage, pour que le lien posté sur un réseau
 *     montre la bonne image et le bon texte ;
 *   - `lang`, que les moteurs utilisent pour cibler le marché.
 */
export function buildHeadTags(meta: SalesPageMeta): string {
  const balises = [
    `<title>${attr(meta.title)}</title>`,
    `<meta name="description" content="${attr(meta.description)}">`,
    `<link rel="canonical" href="${attr(meta.canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${attr(meta.canonical)}">`,
    `<meta property="og:title" content="${attr(meta.title)}">`,
    `<meta property="og:description" content="${attr(meta.description)}">`,
    `<meta property="og:locale" content="${attr(meta.locale)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (meta.ogImage) {
    balises.push(`<meta property="og:image" content="${attr(meta.ogImage)}">`);
    balises.push(`<meta name="twitter:image" content="${attr(meta.ogImage)}">`);
  }
  return balises.join("\n");
}

/**
 * Le HTML prêt à servir.
 *
 * `indexable: false` par défaut, et c'est un choix de sécurité, pas un
 * oubli : tant que la page est en aperçu, elle ne doit surtout pas être
 * indexée. Une page de test qui remonte dans Google fait doublon avec
 * l'originale et abîme le référencement des DEUX. On ne l'ouvre qu'au
 * moment de la mise en ligne, explicitement.
 */
export function renderSalesPage(
  html: string,
  meta: SalesPageMeta,
  opts: { indexable: boolean },
): string {
  let sortie = stripHeadTags(html);

  const tetes = [
    buildHeadTags(meta),
    opts.indexable
      ? ""
      : `<meta name="robots" content="noindex, nofollow">`,
  ]
    .filter(Boolean)
    .join("\n");

  // On insère juste après le premier `<meta charset>` : c'est la seule
  // ancre fiable dans un document capturé, dont le `<head>` peut être
  // implicite (SingleFile ne le réécrit pas toujours).
  const ancre = sortie.match(/<meta[^>]*charset[^>]*>/i);
  if (ancre) {
    sortie = sortie.replace(ancre[0], `${ancre[0]}\n${tetes}`);
  } else {
    sortie = `${tetes}\n${sortie}`;
  }

  return sortie;
}
