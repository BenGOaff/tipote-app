// lib/richTextFieldSize.ts
//
// Taille de police AU NIVEAU DU CHAMP, côté DOM. Sorti de RichTextEdit
// pour deux raisons : c'est la seule façon de le tester, et c'est ce qui
// donne UNE source de vérité à la liste des tailles.
//
// DEUX BUGS SONT NÉS ICI, les deux coûteux :
//
// 1. L'enveloppe empilée (Jocelyne, 1er août 2026). Le navigateur
//    restructure un contentEditable à la moindre commande : centrer un
//    texte l'emballe dans un <div>, et l'enveloppe de taille n'est plus
//    enfant direct. Le code la cherchait en `:scope > .rt-field-fs`, ne
//    la trouvait plus, en créait une SECONDE par-dessus, et la plus
//    profonde gagnait en CSS. Le menu affichait 48px, l'écran gardait
//    32px. `applyFieldFontSize` normalise donc TOUJOURS vers une seule
//    enveloppe, où qu'elles soient.
//
// 2. La liste des tailles était écrite DEUX fois : dans la toolbar et
//    dans l'allowlist du sanitizer (lib/richText.ts). Ajouter une taille
//    d'un seul côté = une taille que l'utilisateur choisit, qui
//    s'affiche, et que la sauvegarde jette en silence. La liste vit
//    maintenant ici, et les deux la lisent.
//
// Le module ne touche au DOM que DANS ses fonctions : il reste
// importable côté serveur (le sanitizer en a besoin).

/** Tailles proposées par la toolbar ET acceptées par le sanitizer. */
export const FIELD_FONT_SIZES = [
  "14px", "16px", "18px", "20px", "24px", "28px", "32px", "40px", "48px", "56px", "64px",
] as const;

export const FIELD_FS_CLASS = "rt-field-fs";

/** Variable CSS écrite selon le device en cours d'édition. */
export type FieldFsVar = "--rt-fs-m" | "--rt-fs-d";
const FS_VARS: readonly FieldFsVar[] = ["--rt-fs-m", "--rt-fs-d"];

/** Toutes les enveloppes du champ, dans l'ordre du DOM (parents d'abord). */
function wrappersIn(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(`.${FIELD_FS_CLASS}`));
}

/**
 * Taille actuellement EN VIGUEUR pour ce device.
 *
 * On lit la plus PROFONDE : en CSS, c'est celle qui porte sa propre
 * variable, donc celle que l'utilisateur voit réellement à l'écran.
 */
export function readFieldFontSize(el: HTMLElement, varName: FieldFsVar): string | null {
  const all = wrappersIn(el);
  const v = all[all.length - 1]?.style.getPropertyValue(varName).trim();
  return v || null;
}

/**
 * Pose (ou retire, avec `null`) la taille du device courant, en
 * ramenant TOUJOURS le champ à une seule enveloppe enfant direct.
 *
 * Effet de bord voulu : un champ déjà cassé (enveloppes empilées par une
 * version précédente) se répare au premier appel.
 */
export function applyFieldFontSize(
  el: HTMLElement,
  varName: FieldFsVar,
  sizePx: string | null,
): void {
  const doc = el.ownerDocument;

  // 1. On repart d'un champ propre, en gardant les tailles en vigueur.
  const existing = wrappersIn(el);
  const deepest = existing[existing.length - 1];
  const sizes: Record<FieldFsVar, string> = {
    "--rt-fs-m": deepest?.style.getPropertyValue("--rt-fs-m").trim() ?? "",
    "--rt-fs-d": deepest?.style.getPropertyValue("--rt-fs-d").trim() ?? "",
  };
  for (const w of existing) {
    w.classList.remove(FIELD_FS_CLASS);
    for (const v of FS_VARS) w.style.removeProperty(v);
    // Le div n'existait QUE pour porter la taille : on le déballe, sinon
    // un div inerte s'ajoute à chaque changement. Un div qui porte encore
    // autre chose (un alignement) reste tel quel.
    const noClass = !w.getAttribute("class")?.trim();
    const noStyle = !w.getAttribute("style")?.trim();
    if (w.tagName === "DIV" && noClass && noStyle && w.parentNode) {
      const parent = w.parentNode;
      while (w.firstChild) parent.insertBefore(w.firstChild, w);
      parent.removeChild(w);
    }
  }

  // 2. Nouvelle valeur pour le device courant.
  sizes[varName] = sizePx ?? "";

  if (!sizes["--rt-fs-m"] && !sizes["--rt-fs-d"]) {
    // Plus aucune taille custom : contenu à plat, retour au défaut
    // responsive du design system.
    return;
  }

  const wrapper = doc.createElement("div");
  wrapper.className = FIELD_FS_CLASS;
  while (el.firstChild) wrapper.appendChild(el.firstChild);
  el.appendChild(wrapper);
  for (const v of FS_VARS) {
    if (sizes[v]) wrapper.style.setProperty(v, sizes[v]);
  }
}

/** Le champ est-il vide ? (le caret doit alors être placé DANS l'enveloppe) */
export function fieldWrapperIsEmpty(el: HTMLElement): HTMLElement | null {
  const w = el.querySelector<HTMLElement>(`:scope > .${FIELD_FS_CLASS}`);
  return w && !w.firstChild ? w : null;
}
