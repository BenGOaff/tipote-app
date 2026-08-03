// lib/quiz/resultBeats.ts
//
// LES 4 TEMPS DE LA PAGE DE RÉSULTAT (demande Béné, 3 août 2026).
//
// L'Atelier enseigne "vendre avec un quiz" en quatre temps. Tiquiz les
// avait déjà tous les trois premiers en base, sous des noms produit qui
// ne disaient pas à quoi ils servent, et il manquait le quatrième :
//
//   1. LE MIROIR  -> title + description
//      Tu lui redis où il en est, avec ses mots. Il se reconnaît, donc il
//      continue à lire.
//   2. LA CAUSE   -> insight (+ insight_heading)
//      Tu nommes ce qui bloque vraiment. C'est souvent autre chose que ce
//      qu'il croyait.
//   3. LE CHEMIN  -> projection (+ projection_heading)
//      Tu montres les étapes pour s'en sortir. Il voit que c'est faisable.
//   4. LE PONT    -> bridge (+ bridge_heading)   << nouveau
//      Tu proposes ton offre comme la suite logique de ce qu'il vient de
//      lire. Pas comme une pub.
//
// POURQUOI CE MODULE EXISTE PLUTÔT QU'UN BLOC DE JSX.
// La décision "quels blocs afficher, dans quel ordre, avec quel titre,
// et lequel est le bloc d'appel" est relue à TROIS endroits : le viewer
// public, l'aperçu de l'éditeur, et le visuel de partage. Les trois
// doivent répondre pareil. Chaque fois qu'un aperçu a recalculé une
// décision au lieu d'appeler la même fonction que le viewer, il a fini
// par mentir (les réseaux de partage, l'affichage du score, l'alignement
// du sous-titre). On ne recommence pas.
//
// GARANTIE DEMANDÉE : "ça ne doit pas toucher les quiz existants".
// Elle tient à `quizzes.result_layout`, qui vaut 'classic' par défaut en
// base. `resultLayoutMode()` ne renvoie 'beats' que sur une valeur
// explicite. Un quiz d'hier reste rendu exactement comme hier ; c'est la
// génération IA qui crée les nouveaux quiz en 'beats'.

export type ResultLayout = "classic" | "beats";

/** Les quatre temps, dans l'ordre où le visiteur les lit. */
export type BeatKey = "mirror" | "cause" | "path" | "bridge";

export const BEAT_ORDER: readonly BeatKey[] = ["mirror", "cause", "path", "bridge"];

/**
 * Mise en page de la page de résultat.
 *
 * Tout ce qui n'est pas explicitement 'beats' retombe sur 'classic'.
 * C'est volontairement strict : une valeur inconnue (colonne absente en
 * prod, typo, vieille ligne) doit rendre la page HISTORIQUE, jamais un
 * écran à moitié construit. Cf. le drame `quiz_events.meta` : une
 * migration non appliquée ne doit jamais casser ce que le visiteur voit.
 */
export function resultLayoutMode(raw: string | null | undefined): ResultLayout {
  return raw === "beats" ? "beats" : "classic";
}

// ── Image par temps ─────────────────────────────────────────────────

/** `with` = image ET texte. `only` = image À LA PLACE du texte. */
export type BeatMediaMode = "with" | "only";

export type BeatMediaItem = {
  url: string;
  /** Largeur en % (25 à 100). Absent = pleine largeur du bloc. */
  width?: number;
  mode: BeatMediaMode;
};

export type BeatMedia = Partial<Record<BeatKey, BeatMediaItem>>;

const MAX_URL = 2000;

/**
 * Nettoie ce qui arrive du client avant écriture.
 *
 * On refuse tout ce qui n'est pas une URL http(s) ou une data-URL image :
 * ce champ finit dans un `<img src>` sur une page publique, donc un
 * `javascript:` y serait une faille, pas un détail de validation.
 */
export function sanitizeBeatMedia(raw: unknown): BeatMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const out: BeatMedia = {};
  for (const key of BEAT_ORDER) {
    const item = (raw as Record<string, unknown>)[key];
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const url = typeof it.url === "string" ? it.url.trim() : "";
    if (!url || url.length > MAX_URL) continue;
    if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) continue;
    const entry: BeatMediaItem = { url, mode: it.mode === "only" ? "only" : "with" };
    if (typeof it.width === "number" && Number.isFinite(it.width)) {
      const w = Math.round(it.width);
      if (w >= 25 && w < 100) entry.width = w;
    }
    out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ── Construction des temps à afficher ───────────────────────────────

export type BeatSource = {
  /** Le profil obtenu. */
  result: {
    title?: string | null;
    description?: string | null;
    insight?: string | null;
    insight_heading?: string | null;
    projection?: string | null;
    projection_heading?: string | null;
    bridge?: string | null;
    bridge_heading?: string | null;
    beat_media?: unknown;
  } | null | undefined;
  /** Les réglages communs du quiz. */
  quiz: {
    result_insight_heading?: string | null;
    result_projection_heading?: string | null;
    result_bridge_heading?: string | null;
    show_result_insight?: boolean | null;
    show_result_projection?: boolean | null;
    show_result_bridge?: boolean | null;
  };
  /** Titres par défaut traduits, quand ni le profil ni le quiz n'en ont. */
  fallbackHeadings: { cause: string; path: string; bridge: string };
};

export type ResultBeat = {
  key: BeatKey;
  /** Titre du bloc. Vide pour le miroir : son titre est le nom du profil. */
  heading: string;
  /** Corps du bloc (HTML riche ou texte brut selon l'historique). */
  body: string;
  media: BeatMediaItem | null;
  /** Le texte est-il rendu ? `false` quand l'image le remplace. */
  showText: boolean;
  /**
   * Bloc d'APPEL : celui sur lequel l'oeil doit s'arrêter avant le
   * bouton. Un seul, toujours le pont. C'est ce qui évite les "4 cartes
   * de couleurs" que Béné refuse : trois temps sobres, un temps plein.
   */
  emphasis: boolean;
};

function txt(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Un bloc rich-text peut être `<p></p>` : non vide, mais sans un mot. */
function hasWords(html: string, stripHtml: (s: string) => string): boolean {
  return stripHtml(html).trim().length > 0;
}

/**
 * Les temps à afficher, dans l'ordre, prêts à rendre.
 *
 * `stripHtml` est passé en paramètre plutôt qu'importé : ce module doit
 * rester utilisable côté serveur (visuel de partage) comme côté client,
 * et testable sans DOM.
 *
 * Le MIROIR n'est jamais renvoyé ici : son titre est le nom du profil,
 * rendu en `<h2>` avec sa propre typographie, et sa description le suit.
 * Le sortir de la liste évite de lui inventer un titre de bloc qui
 * ferait doublon avec le nom du profil.
 */
export function buildResultBeats(
  src: BeatSource,
  stripHtml: (s: string) => string,
): ResultBeat[] {
  const { result, quiz, fallbackHeadings } = src;
  if (!result) return [];
  const media = sanitizeBeatMedia(result.beat_media) ?? {};

  const defs: { key: BeatKey; body: string; heading: string; shown: boolean }[] = [
    {
      key: "cause",
      body: txt(result.insight),
      heading: txt(result.insight_heading) || txt(quiz.result_insight_heading) || fallbackHeadings.cause,
      shown: quiz.show_result_insight !== false,
    },
    {
      key: "path",
      body: txt(result.projection),
      heading: txt(result.projection_heading) || txt(quiz.result_projection_heading) || fallbackHeadings.path,
      shown: quiz.show_result_projection !== false,
    },
    {
      key: "bridge",
      body: txt(result.bridge),
      heading: txt(result.bridge_heading) || txt(quiz.result_bridge_heading) || fallbackHeadings.bridge,
      shown: quiz.show_result_bridge !== false,
    },
  ];

  const beats: ResultBeat[] = [];
  for (const d of defs) {
    if (!d.shown) continue;
    const m = media[d.key] ?? null;
    const bodyHasWords = d.body !== "" && hasWords(d.body, stripHtml);
    // Une image seule suffit à justifier le bloc : c'est le cas
    // "remplacer le texte par une image" demandé explicitement.
    if (!bodyHasWords && !m) continue;
    const showText = bodyHasWords && !(m && m.mode === "only");
    // Un bloc dont le texte est masqué ET sans image n'existe pas.
    if (!showText && !m) continue;
    beats.push({ key: d.key, heading: d.heading, body: d.body, media: m, showText, emphasis: d.key === "bridge" });
  }
  return beats;
}

/** L'image du MIROIR, gérée à part puisque ce temps n'est pas un bloc. */
export function mirrorMedia(rawBeatMedia: unknown): BeatMediaItem | null {
  return (sanitizeBeatMedia(rawBeatMedia) ?? {}).mirror ?? null;
}

// ── L'habillage d'un temps ──────────────────────────────────────────

/**
 * Classes et styles d'un bloc, décidés UNE fois pour le viewer ET pour
 * l'aperçu de l'éditeur.
 *
 * C'est le point où les régressions naissent d'habitude : l'aperçu
 * recopie l'allure du viewer "à peu près", puis l'un des deux évolue.
 * Les réseaux de partage, l'affichage du score et l'alignement du
 * sous-titre ont tous connu ça. Ici, un seul endroit décide.
 *
 * CHOIX DE DESIGN (Béné, 3 août 2026) : "séparer visuellement ces 4
 * étapes, sans forcément créer 4 cartes de couleurs trop IA et facile à
 * mettre au branding de l'user".
 *   - les trois premiers temps : un simple filet vertical à la couleur
 *     de marque, pas de fond, pas de bordure complète. Ça se lit comme
 *     un rythme, pas comme quatre encadrés.
 *   - le pont : le seul bloc PLEIN, à la couleur de marque. C'est le
 *     bloc sur lequel l'oeil s'arrête avant le bouton.
 * Tout est dérivé de `primary`, donc n'importe quel branding marche sans
 * réglage.
 */
export type BeatShell = {
  containerClass: string;
  containerStyle: Record<string, string>;
  headingClass: string;
  headingStyle: Record<string, string>;
  /** Classe de couleur du corps ("" quand la couleur vient du style). */
  bodyToneClass: string;
};

export function beatShell(
  layout: ResultLayout,
  key: BeatKey,
  primary: string,
  filledTextColor: string,
): BeatShell {
  // Page historique : on reproduit EXACTEMENT les deux cartes d'avant.
  // Ce n'est pas de la dette, c'est la garantie donnée aux quiz existants.
  if (layout === "classic") {
    if (key === "path") {
      return {
        containerClass: "p-4 rounded-xl border",
        containerStyle: { backgroundColor: `${primary}0d`, borderColor: `${primary}33` },
        headingClass: "text-xs font-bold uppercase tracking-widest mb-1.5",
        headingStyle: { color: `${primary}b3` },
        bodyToneClass: "",
      };
    }
    return {
      containerClass: "p-4 rounded-xl bg-muted/50 border",
      containerStyle: {},
      headingClass: "text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5",
      headingStyle: {},
      bodyToneClass: "",
    };
  }

  if (key === "bridge") {
    return {
      containerClass: "rounded-2xl px-5 py-5 sm:px-6 sm:py-6 space-y-2",
      containerStyle: { backgroundColor: primary, color: filledTextColor },
      headingClass: "text-base sm:text-lg font-bold leading-snug",
      headingStyle: {},
      bodyToneClass: "",
    };
  }
  return {
    containerClass: "border-l-[3px] pl-4 sm:pl-5 space-y-1.5",
    containerStyle: { borderColor: primary },
    headingClass: "text-base sm:text-lg font-bold leading-snug",
    headingStyle: { color: primary },
    bodyToneClass: "text-muted-foreground",
  };
}

/**
 * Couleur de texte lisible sur le bloc plein.
 *
 * Le pont prend la couleur de marque en fond : une créatrice qui choisit
 * un jaune pâle doit obtenir du texte sombre, pas du blanc sur blanc.
 * `dark` vient du même helper de luminance que le reste du branding.
 */
export function bridgeTextColor(primaryIsDark: boolean): string {
  return primaryIsDark ? "#ffffff" : "#111827";
}
