// lib/texteBrut.ts
//
// LA SEULE PORTE ENTRE UN CHAMP RICHE ET DU TEXTE BRUT.
//
// Ce module est PUR : ni DOMPurify, ni supabaseAdmin, ni `server-only`.
// Un module de decision, un email, un prompt ou un test peut donc
// l'importer sans rien charger d'autre. C'est la condition pour que la
// regle soit la MEME partout : tant que `stripHtml` vivait dans
// `lib/richText.ts` avec DOMPurify, chaque fichier qui voulait juste
// retirer des balises reecrivait son propre
// `.replace(/<[^>]*>/g, "")` -- et celui la ne decode AUCUNE entite.
//
// C'est ce qui a coute le retour du 16 septembre 2026 : une question de
// sondage affichee "Quelle note donneriez-vous a la structure de
// l'entreprise&nbsp;?" dans les stats de la creatrice, alors que le
// viewer public, lui, la rendait juste.
//
// `lib/richText.ts` reexporte les trois fonctions : les imports existants
// (`from "@/lib/richText"`) continuent de marcher a l'identique.

import { reparerEntitesCassees } from "@/lib/frenchTypography";

// L'ENTITE `&nbsp;` EST FABRIQUEE PAR NOUS (retour client via Bene,
// 16 septembre 2026 : "Quelle note donneriez-vous a la structure de
// l'entreprise&nbsp;?" -- "ca fait des MOIS que j'essaye de regler ce
// probleme qui revient toujours quelque part").
//
// MESURE, PAS DEDUCTION. Le serialiseur de DOMPurify reencode U+00A0 en
// `&nbsp;` des que le champ porte UNE balise :
//
//   sanitizeRichText("entreprise\u00a0?")           -> "entreprise\u00a0?"
//   sanitizeRichText("<b>x</b> entreprise\u00a0?")  -> "<b>x</b> entreprise&nbsp;?"
//
// Or `lib/frenchTypography.ts` INSERE ce caractere devant `? ! : ;` a
// chaque enregistrement. Donc toute question mise en forme repart de la
// base avec l'entite, et le moindre ecran qui la rend en TEXTE BRUT
// l'affiche en clair. C'est exactement le "y'a que celle-la" du retour :
// les questions jamais mises en forme gardent le caractere, les autres
// non. Nettoyer la base n'aurait servi a rien, l'entite serait revenue au
// premier enregistrement.
//
// ON REND DONC LE CARACTERE. Il s'affiche a l'identique en HTML (c'est la
// MEME espace insecable), il traverse un noeud de texte sans rien montrer,
// et l'espace francaise est PRESERVEE -- une espace ordinaire laisserait le
// `?` tomber seul a la ligne suivante, le drame Damien du 27 aout.
//
// UNE SEULE ENTITE, ET C'EST MESURE. `&amp;` `&lt;` `&gt;` sont
// STRUCTURELS : les decoder casserait le HTML. Les accents, le `€`, les
// emoji, les apostrophes et U+202F ne sont pas encodes du tout. `&nbsp;`
// est la SEULE entite cosmetique que le serialiseur fabrique.
//
// `&amp;nbsp;` (une creatrice qui ecrit vraiment le texte "&nbsp;") n'est
// PAS touche : le motif exige un `&` colle devant `nbsp;`, et il y a
// `amp;` entre les deux.
const ENTITE_INSECABLE = /&nbsp;|&#160;|&#x0*a0;/gi;

/** L'espace insecable redevient son CARACTERE. Voir le bloc ci-dessus. */
export function sansEntiteInsecable(html: string): string {
  return html.replace(ENTITE_INSECABLE, "\u00A0");
}

// Decode les entités HTML nommées/numériques les plus fréquentes SANS
// toucher aux balises ni aux espaces (contrairement à stripHtml, qui
// supprime les balises et écrase les blancs). À utiliser quand on rend un
// champ auteur en TEXTE BRUT (JSX children) alors qu'il peut contenir un
// `&nbsp;` collé par le contentEditable : sans ça, l'entité apparait en
// clair (ex. "et&nbsp;" affiché tel quel sur l'intro d'un sondage).
export function decodeHtmlEntities(input: string | null | undefined): string {
  if (!input || input.indexOf("&") === -1) return input ?? "";
  return input
    // L'INSECABLE REDEVIENT L'INSECABLE, pas une espace ordinaire
    // (16 septembre 2026). Le commentaire d'avant disait "un noeud de
    // texte n'a pas besoin de l'insecable pour ne pas couper" : c'est
    // FAUX, un noeud de texte coupe sur une espace ordinaire comme
    // n'importe ou ailleurs. On aurait donc retire l'espace francaise
    // qu'on venait d'inserer (drame Damien, 27 aout).
    .replace(/&nbsp;/g, "\u00A0")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    // &amp; en dernier, sinon on double-décode `&amp;nbsp;`.
    .replace(/&amp;/g, "&");
}

// Strip all HTML tags AND decode HTML entities — used for short previews,
// OpenGraph metadata, navigator.share titles, etc. Le précédent stripHtml
// laissait `&nbsp;`, `&amp;`, `&#39;`… visibles en clair dans les aperçus
// de partage (cf. rapport iMessage Tiquiz, 16 mai 2026) parce qu'on rend
// la sortie comme texte JSX et non comme HTML — les entités ne sont
// alors jamais décodées par le browser.
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  // Même réparation que dans `sanitizeRichText` : ce chemin sert les
  // aperçus de partage, les `og:title` et les libellés d'admin, où un
  // `&nbsp ;` non réparé s'afficherait en toutes lettres.
  return reparerEntitesCassees(input)
    // UNE FRONTIERE DE BLOC EST UNE ESPACE (Damien, 27 aout 2026). Son
    // titre est `Tu as une expertise ?<div>Qu'est-ce qui...</div>` : deux
    // lignes a l'ecran, et un seul mot une fois les balises retirees,
    // parce qu'on les remplacait par RIEN. Le texte de partage et le
    // `og:title` sortaient en "expertise ?Qu'est-ce".
    //
    // Ca vaut pour l'ouvrante autant que pour la fermante : ici la
    // coupure est un <div> OUVRANT, sans fermante avant lui. Le
    // `\s+` -> " " plus bas absorbe les doublons de `</div><div>`.
    .replace(/<\/?(?:div|p|li|ul|ol|h[1-6]|blockquote|section|article|tr)[^>]*>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    // Entités nommées les plus fréquentes du contentEditable (le browser
    // insère systématiquement `&nbsp;` à la place des espaces protégés).
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Décimales / hex (ex. &#39; pour l'apostrophe droite).
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    // &amp; en dernier, sinon on double-decode `&amp;nbsp;`.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
