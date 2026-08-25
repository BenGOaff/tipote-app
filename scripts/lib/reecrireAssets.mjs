// scripts/lib/reecrireAssets.mjs
//
// LA SEULE FONCTION QUI DÉCIDE DE MODIFIER LE CONTENU D'UNE CLIENTE.
//
// Elle vit à part de `storage-migrate.mjs` pour une raison et une seule :
// ce script exige des variables d'environnement et une base au
// chargement, donc aucun test ne peut l'importer. Or c'est le code le
// plus dangereux de tout le dépôt : il réécrit des adresses d'images
// DANS des quiz en ligne. C'est exactement là que les bugs s'installent
// (règle du 1er août, et le verrou des webhooks du 24 août l'a repayée).
//
// -- LES TROIS RÈGLES ---------------------------------------------------
//
// 1. **On ne réécrit que ce dont le fichier existe VRAIMENT chez nous.**
//    `fichierPresent` est un PARAMÈTRE, pas un appel au disque caché
//    dedans : c'est ce qui rend la fonction testable, et ça oblige
//    l'appelant à dire où il regarde.
// 2. **On ne touche à rien d'autre.** Une adresse Supabase d'un AUTRE
//    bucket, une adresse déjà migrée, un texte quelconque : rendus tels
//    quels, au caractère près.
// 3. **On rend la valeur inchangée quand rien ne change**, ce qui permet
//    à l'appelant de ne réécrire que les lignes qui bougent vraiment.

/** Ferme une adresse : le premier caractère qui n'en fait plus partie. */
const FIN_URL = /[\s"'<>)\\]/;

/**
 * Réécrit les adresses d'un bucket Supabase vers notre serveur, dans UNE
 * chaîne (du texte, du HTML de texte riche, une valeur JSON).
 *
 * @param {string} texte
 * @param {{prefixes: string[], base: string, fichierPresent: (chemin: string) => boolean, manquants?: Set<string>}} regles
 */
export function reecrireTexte(texte, regles) {
  const { prefixes, base, fichierPresent, manquants } = regles;
  let sortie = texte;
  for (const prefixe of prefixes) {
    let i = 0;
    while ((i = sortie.indexOf(prefixe, i)) !== -1) {
      const debut = i + prefixe.length;
      let fin = debut;
      while (fin < sortie.length && !FIN_URL.test(sortie[fin])) fin += 1;
      const brut = sortie.slice(debut, fin);

      // On isole le CHEMIN, et on note où il s'arrête. Ce qui suit (une
      // query `?width=800`, une entité HTML `&amp;`) appartient à la
      // cliente : on le laisse exactement où il est. Avaler ces quelques
      // caractères casserait son HTML en croyant corriger une adresse.
      let cheminBrut = brut;
      const entite = cheminBrut.match(/&(amp|quot|apos|lt|gt|#\d+);/i);
      if (entite) cheminBrut = cheminBrut.slice(0, entite.index);
      cheminBrut = cheminBrut.split("?")[0].split("#")[0];

      let chemin = cheminBrut;
      try {
        chemin = decodeURIComponent(cheminBrut);
      } catch {
        /* une adresse mal encodée reste lisible telle quelle */
      }
      if (!chemin || !fichierPresent(chemin)) {
        if (chemin && manquants) manquants.add(chemin);
        i = fin;
        continue;
      }
      const neuf = `${base}/${chemin.split("/").map(encodeURIComponent).join("/")}`;
      const finReelle = debut + cheminBrut.length;
      sortie = sortie.slice(0, i) + neuf + sortie.slice(finReelle);
      i = i + neuf.length;
    }
  }
  return sortie;
}

/** Descend dans les objets et les tableaux (colonnes JSONB). */
export function reecrireValeur(valeur, regles) {
  if (typeof valeur === "string") return reecrireTexte(valeur, regles);
  if (Array.isArray(valeur)) return valeur.map((v) => reecrireValeur(v, regles));
  if (valeur && typeof valeur === "object") {
    const o = {};
    for (const [k, v] of Object.entries(valeur)) o[k] = reecrireValeur(v, regles);
    return o;
  }
  return valeur;
}

/** Les deux formes d'adresse publique que Supabase produit pour un bucket. */
export function prefixesSupabase(urlBase, bucket) {
  const b = String(urlBase).replace(/\/+$/, "");
  return [
    `${b}/storage/v1/object/public/${bucket}/`,
    `${b}/storage/v1/render/image/public/${bucket}/`,
  ];
}
