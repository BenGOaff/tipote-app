// lib/frenchTypography.ts
//
// TYPOGRAPHIE FRANÇAISE : l'espace insécable avant `: ; ! ?` et `»`, après
// `«`.
//
// POURQUOI CE FICHIER A ÉTÉ RÉÉCRIT (retour Béné, 3 août 2026).
// "Un problème qu'on avait corrigé et qui revient. Ce genre de petits
// détails est chiant et long à corriger, on peut se l'éviter ?"
//
// Oui, mais pas en recorrigeant : en retirant les deux causes.
//
// CAUSE 1 : la transformation ne faisait que CONVERTIR une espace déjà
// présente. "Prêt ?" devenait "Prêt<nbsp>?" ; "Prêt?" restait "Prêt?".
// Or un modèle de langue écrit très souvent le français sans l'espace.
// Tout le contenu généré arrivait donc fautif, et le restait après
// n'importe quel nombre de sauvegardes. La fonction INSÈRE désormais
// l'espace manquante.
//
// CAUSE 2 : elle n'était appliquée qu'à la MISE À JOUR, sur une liste de
// colonnes écrite à la main. La CRÉATION (génération IA, import) n'en
// appliquait aucune, et toute nouvelle colonne était oubliée par défaut.
// `applyFrenchTypographyDeep` parcourt maintenant le contenu entier avec
// une liste NOIRE : un champ nouveau est couvert d'office, et c'est ce
// renversement qui fait disparaître la classe de bug.
//
// TOUT CE QU'IL NE FAUT SURTOUT PAS TOUCHER. Insérer une espace est plus
// dangereux que d'en convertir une : on peut casser du contenu qui n'est
// pas de la prose. Les pièges, tous couverts par les tests :
//   - les URL : le `?` d'une query (`a?b=1`), le `:` d'un schéma (`https://`) ;
//   - les heures et les rapports : `12:30`, `8:1` ;
//   - le CSS d'un attribut `style` : `color:red` ;
//   - les entités HTML : `&nbsp;`, `&eacute;` (leur `;` est structurel) ;
//   - les balises elles-mêmes : `<a href="...">`.
// La règle générale : on n'insère que devant une ponctuation qui TERMINE
// vraiment (suivie d'une espace, d'une fermeture, ou de la fin du texte).

/** Espace insécable (U+00A0). */
const NBSP = " ";

// ── Étape 1 : une espace ASCII déjà là devient insécable ─────────────
// Inchangé depuis l'origine. Une espace insécable déjà posée ne matche
// pas (le motif exige une espace ASCII), donc la fonction est idempotente.
const SPACE_BEFORE_CLOSING = /([\p{L}\p{N}]) ([:;!?»])/gu;
const SPACE_AFTER_OPENING = /(«) ([\p{L}\p{N}])/gu;

// ── Étape 2 : l'espace ABSENTE est insérée ───────────────────────────
//
// `?` et `!` : la ponctuation doit TERMINER (espace, fermeture, fin du
// texte). Sans ce garde-fou, `page?ref=1` deviendrait `page ?ref=1`.
const MISSING_BEFORE_BANG = /([\p{L}\p{N}])([!?])(?=[\s)\]}»"'.,…!?]|$)/gu;
// `;` : même garde-fou. Les entités HTML sont protégées en amont, par le
// découpage de `applyFrenchTypographyToHtml`.
const MISSING_BEFORE_SEMI = /([\p{L}\p{N}])(;)(?=[\s)\]}»"']|$)/gu;
// `:` : une LETTRE devant, jamais un chiffre, sinon on casserait `12:30`
// et `8:1`. Et une fin derrière, sinon on casserait `https://` et
// `color:red`.
const MISSING_BEFORE_COLON = /(\p{L})(:)(?=[\s)\]}»"']|$)/gu;
// `»` et `«` : aucun risque, ces signes n'existent ni dans une URL ni
// dans du CSS.
const MISSING_BEFORE_RAQUO = /([\p{L}\p{N}])(»)/gu;
const MISSING_AFTER_LAQUO = /(«)([\p{L}\p{N}])/gu;

export function isFrenchLocale(locale: string | null | undefined): boolean {
  if (!locale) return false;
  return locale.toLowerCase().startsWith("fr");
}

/** Le coeur de la règle, sur un fragment SANS balise ni entité. */
function fixFragment(text: string): string {
  return text
    .replace(SPACE_BEFORE_CLOSING, `$1${NBSP}$2`)
    .replace(SPACE_AFTER_OPENING, `$1${NBSP}$2`)
    .replace(MISSING_BEFORE_BANG, `$1${NBSP}$2`)
    .replace(MISSING_BEFORE_SEMI, `$1${NBSP}$2`)
    .replace(MISSING_BEFORE_COLON, `$1${NBSP}$2`)
    .replace(MISSING_BEFORE_RAQUO, `$1${NBSP}$2`)
    .replace(MISSING_AFTER_LAQUO, `$1${NBSP}$2`);
}

/**
 * Une balise ouvrante, fermante, un commentaire ou un doctype. Sert à
 * reconnaître qu'une valeur est du HTML et pas du texte brut. Même motif
 * que `applyFrenchTypographyDeep`, écrit UNE fois pour les deux.
 */
const LOOKS_LIKE_HTML = /<[a-z!/][^>]*>/i;

/**
 * Texte brut. No-op hors français, pour ne pas abîmer l'anglais,
 * l'espagnol, l'allemand, l'italien, le portugais ni l'arabe : aucun ne
 * prend cette espace.
 *
 * -- ET SI ON LUI DONNE DU HTML ? (drame Eric, 4 août 2026) -----------
 *
 * "Il modifie la taille du titre, il enregistre, et dès qu'il a
 * enregistré la taille revient à l'original."
 *
 * La taille d'un champ vit dans `style="--rt-fs-d: 48px"`. Or le nom de
 * la variable finit par une LETTRE et le `:` est suivi d'une espace :
 * pour la règle française, c'est exactement un deux-points qui mérite
 * son espace insécable. Appliquée au HTML brut, elle écrivait
 * `--rt-fs-d&nbsp;: 48px`, une propriété CSS qui n'existe pas, que le
 * sanitizer jetait ensuite en silence. La taille était donc détruite à
 * CHAQUE enregistrement, sans le moindre message.
 *
 * `applyFrenchTypographyToHtml` existait déjà et ne fait pas cette
 * faute : elle découpe sur les balises et ne touche qu'au texte visible.
 * Trois appelants prenaient la mauvaise des deux.
 *
 * **On ne compte donc plus sur l'appelant pour choisir.** Une valeur qui
 * contient une balise part vers la version HTML, point. C'est la même
 * leçon que la liste blanche des colonnes supprimée le 3 août : quand
 * une erreur ne coûte rien à commettre et détruit du travail en
 * silence, on rend l'erreur IMPOSSIBLE, on ne demande pas d'y penser.
 */
export function applyFrenchTypography(
  text: string | null | undefined,
  locale: string | null | undefined,
): string {
  if (!text) return "";
  if (!isFrenchLocale(locale)) return text;
  if (LOOKS_LIKE_HTML.test(text)) return applyFrenchTypographyToHtml(text, locale);
  return fixFragment(text);
}

// Une balise complète, ou une entité HTML. Ce sont les deux zones où la
// règle ne doit JAMAIS entrer : le `;` d'une entité est structurel, et un
// attribut peut contenir une URL ou du CSS.
const TAG_OR_ENTITY = /<[^>]*>|&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * Chaîne HTML : on ne transforme QUE le texte visible.
 *
 * L'ancienne version appliquait les motifs à tout le HTML, en assumant
 * qu'un attribut ne contient jamais "lettre + espace + ponctuation". Cette
 * hypothèse tenait tant qu'on se contentait de CONVERTIR une espace. Elle
 * s'effondre dès qu'on en INSÈRE une : `style="color:red"` et `&nbsp;`
 * deviendraient du texte cassé. On découpe donc sur les balises et les
 * entités, et on ne touche qu'à ce qu'il y a entre.
 */
export function applyFrenchTypographyToHtml(
  html: string | null | undefined,
  locale: string | null | undefined,
): string {
  if (!html) return "";
  if (!isFrenchLocale(locale)) return html;

  let out = "";
  let cursor = 0;
  TAG_OR_ENTITY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_OR_ENTITY.exec(html)) !== null) {
    out += fixFragment(html.slice(cursor, match.index));
    out += match[0]; // la balise ou l'entité, telle quelle
    cursor = match.index + match[0].length;
  }
  out += fixFragment(html.slice(cursor));
  return out;
}

// ── Application à un contenu entier ─────────────────────────────────

/**
 * Noms de champs à NE JAMAIS transformer.
 *
 * LISTE NOIRE, et c'est tout l'enjeu. Une liste blanche oblige à penser à
 * chaque nouvelle colonne, donc elle en oublie une tôt ou tard et le bug
 * revient : c'est exactement ce qui s'est passé. Avec une liste noire, un
 * champ nouveau est traité par défaut ; au pire on applique la règle à
 * quelque chose qui n'en avait pas besoin, ce qui ne casse rien puisque
 * les gardes de `fixFragment` protègent déjà les formats techniques.
 */
const SKIP_KEY =
  /(^|_)(id|ids|url|urls|slug|slugs|color|colors|gradient|font|locale|mode|status|secret|key|token|email|tag|tags|networks|media|axes|config|pixel)($|_)/i;

/** Valeurs qui ne sont manifestement pas de la prose. */
function looksTechnical(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (/^(https?:|data:|mailto:|tel:|#|\/)/i.test(v)) return true;
  // Identifiant, énumération, slug : ni espace ni ponctuation française.
  if (/^[a-z0-9_-]+$/i.test(v)) return true;
  return false;
}

/**
 * Applique la typographie à TOUT le contenu textuel d'un objet.
 *
 * Récursif : les questions portent leurs options, les résultats leurs
 * textes. Ne modifie jamais l'objet reçu et renvoie une copie, pour qu'un
 * appelant qui garde une référence sur le payload d'origine ne voie pas
 * son contenu changer sous ses pieds.
 */
export function applyFrenchTypographyDeep<T>(value: T, locale: string | null | undefined): T {
  if (!isFrenchLocale(locale)) return value;
  return walk(value, locale, false) as T;
}

function walk(value: unknown, locale: string | null | undefined, skip: boolean): unknown {
  if (typeof value === "string") {
    if (skip || looksTechnical(value)) return value;
    // Un fragment HTML se reconnaît à ses balises : sans ce test, on
    // appliquerait la version texte brut à du HTML, donc aussi aux
    // attributs.
    return /<[a-z!/][^>]*>/i.test(value)
      ? applyFrenchTypographyToHtml(value, locale)
      : applyFrenchTypography(value, locale);
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, locale, skip));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v, locale, skip || SKIP_KEY.test(k));
    }
    return out;
  }
  return value;
}
