// Plateformes supportées par l'extension : adapter pattern pour ne pas
// coder en dur les selectors / DOM tricks LinkedIn-only. Chaque réseau
// fournit son propre objet `PlatformAdapter` ; le content script choisit
// le bon en fonction de `location.hostname`.
//
// Phase 1 (21-22 mai 2026) : LinkedIn (existant) + Facebook + Threads +
// Instagram + X/Twitter en mode "aide à la rédaction" uniquement —
// AUCUNE auto-action, juste injection de suggestions IA dans le composer.
// L'user lit, ajuste, publie lui-même.
//
// Phase 2 / 3 (plus tard) : OAuth cross-posting + coordination pod
// (hot post detector, comment chains).

export interface PlatformAdapter {
  /** Identifiant interne (pour les logs et la sélection). */
  id: "linkedin" | "facebook" | "threads" | "instagram" | "x" | "tiktok" | "reddit";

  /** Hostnames qui matchent cette plateforme. Match par `endsWith()`.
   *  Ex: "linkedin.com" matche aussi "fr.linkedin.com", "www.linkedin.com". */
  hosts: string[];

  /** Vérifie qu'un élément DOM est un composer de commentaire/post
   *  ciblable. Doit être robuste aux mutations de la page (LinkedIn
   *  recharge des composers en SPA toute la journée). */
  isComposer(el: HTMLElement): boolean;

  /** Si le platform a aussi un composer de POST (pas juste commentaire),
   *  on l'autorise (X tweet box, FB status box, etc.). Optionnel. */
  isPostComposer?(el: HTMLElement): boolean;

  /** Cherche le post auquel ce composer répond, pour donner du contexte
   *  à l'IA. Retourne null si on est sur un composer de post (= pas de
   *  parent post). La heuristique remonte le DOM ; chaque plateforme a
   *  sa propre logique car la profondeur du composer dans le DOM varie. */
  findParentPost(composer: HTMLElement): HTMLElement | null;

  /** Si vrai, le trigger "✨ Tipote" est positionné en `position: fixed`
   *  attaché à body (utile pour TikTok où l'insertion dans l'arbre DOM
   *  casse la réconciliation React, et Reddit qui place le bouton dans
   *  un slot non rendu). Par défaut false : insertion inline au-dessus
   *  du composer (UX visuelle plus intégrée). */
  useFixedTrigger?: boolean;

  /** Si vrai, l'adapter ne touche pas le DOM/composer : fillEditor copie
   *  juste dans le clipboard. L'UI doit afficher "Copié — Ctrl+V" au
   *  lieu de "Inséré ✓". Utilisé pour TikTok qui crashe à toute
   *  interaction avec leur composer. */
  clipboardMode?: boolean;

  /** Insère du texte dans l'éditeur. Chaque réseau utilise un framework
   *  différent (TipTap LinkedIn, Lexical Meta, DraftJS X) — chaque
   *  adapter a sa propre stratégie. Doit dispatcher les bons events
   *  pour que le bouton "Publier" du réseau se déverrouille. */
  fillEditor(composer: HTMLElement, text: string): void;
}
