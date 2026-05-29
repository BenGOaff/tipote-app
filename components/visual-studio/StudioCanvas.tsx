"use client";

// Canvas Fabric.js du Studio visuels — moteur d'édition.
//
// Chargé UNIQUEMENT côté client (next/dynamic ssr:false) : Fabric touche
// le DOM/canvas et son package interdit l'import côté Node (exports.node
// = null). L'édition de texte est NATIVE (caret + sélection dans le
// canvas) → on peut styliser une PARTIE du texte (un mot en gras/couleur)
// via setSelectionStyles. C'est tout l'intérêt de Fabric vs Konva ici.
//
// Repère : on travaille en pixels d'AFFICHAGE (pas de zoom viewport, pour
// que getBoundingRect donne directement la position écran de la barre
// flottante). L'export applique multiplier = renderWidth/displayWidth pour
// un PNG pleine résolution.

import { useEffect, useRef } from "react";
import { Canvas, Textbox, Rect, FabricImage, Gradient, cache, filters } from "fabric";
import type { FabricObject } from "fabric";
import { fontStackFor, DISPLAY_HEADING_STACK } from "@/lib/visualStudio/presets";
import type {
  BackgroundSpec,
  BrandKit,
  StudioFormat,
  TextLayerId,
} from "@/lib/visualStudio/types";

/** Rectangle en pixels d'AFFICHAGE, relatif au coin haut-gauche du canvas. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** État du texte sélectionné, remonté pour que la barre flottante le reflète. */
export interface SelectionInfo {
  rect: ScreenRect;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fill: string;
  fontFamily: string;
  align: "left" | "center" | "right";
  isEditing: boolean;
  /** Plage sélectionnée en édition (-1 si pas d'édition/plage). */
  selStart: number;
  selEnd: number;
  /** Identifiant du calque texte actif — sert de clé STABLE à la barre
   *  flottante (sinon elle se remonte à chaque changement de plage, ce
   *  qui ferme le color picker en cours d'utilisation). */
  layerId: string;
}

/** Patch de style appliqué à la sélection courante (ou tout l'objet). */
export interface StylePatch {
  toggleBold?: boolean;
  toggleItalic?: boolean;
  toggleUnderline?: boolean;
  fontFamily?: string;
  fill?: string;
  align?: "left" | "center" | "right";
  fontDelta?: number;
}

export interface StudioCanvasHandle {
  toBlob: () => Promise<Blob>;
  /** Applique un style. `range` force une plage (mot sélectionné) même si
   *  Fabric a quitté le mode édition (clic sur la barre HTML). */
  applyStyle: (patch: StylePatch, range?: { start: number; end: number } | null) => void;
  /** Plage actuellement sélectionnée dans le texte en édition, sinon null. */
  getSelectionRange: () => { start: number; end: number } | null;
  enterEdit: () => void;
  deleteActive: () => void;
  addText: () => void;
  /** Remplace le contenu d'un calque texte (par layerId) — utilisé par la
   *  génération de copy IA (titre/sous-titre/CTA). No-op si le calque
   *  n'existe pas. */
  setLayerText: (id: string, text: string) => void;
  /** Place le bloc texte en haut, centré ou en bas (selon l'analyse d'image),
   *  éventuellement dans une colonne latérale (sujet d'un côté → texte de
   *  l'autre), et applique la couleur adaptée au titre/sous-titre. */
  setTextPlacement: (
    anchor: "top" | "center" | "bottom",
    textColor: string,
    textSide?: "left" | "right" | "full",
  ) => void;
  /** Change la police du titre + de l'accent (adaptée au thème/style). */
  setHeadingFont: (stack: string) => void;
  /** Choisit le gabarit : centré (hero), aligné à gauche (éditorial, barre
   *  d'accent), ou carte (panneau derrière le texte). */
  setAlign: (align: "center" | "left" | "card") => void;
  /** Surligne un extrait du titre dans la couleur de marque (mot d'accent).
   *  `word` doit être un sous-texte exact du titre ; "" enlève le surlignage. */
  highlightHeadline: (word: string) => void;
  /** Gabarit de rendu : "auto" = texte, "data" = barres comparatives,
   *  "beforeAfter" = deux panneaux avant/après, "carousel" = slide flat de marque. */
  setTemplate: (template: "auto" | "data" | "beforeAfter" | "carousel") => void;
  /** Jeu de données pour le gabarit "data" (barres). */
  setStats: (stats: ChartStat[]) => void;
  /** Phrases avant/après pour le gabarit "beforeAfter". */
  setBeforeAfter: (before: string, after: string) => void;
  /** Active/configure une slide de CARROUSEL (rendu flat : fond de marque uni,
   *  zéro ombre/gradient, footer marque + numéro). Bascule sur le gabarit
   *  "carousel". */
  setCarousel: (params: CarouselRenderParams) => void;
  /** Lit le texte courant d'un calque (pour persister les éditions WYSIWYG
   *  d'une slide avant de naviguer / d'exporter). "" si le calque n'existe pas. */
  getLayerText: (id: string) => string;
}

/** Paramètres de rendu d'une slide de carrousel (flat, couleurs de marque). */
export interface CarouselRenderParams {
  index: number;
  total: number;
  bg: string;
  textColor: string;
  accentColor: string;
  buttonColor: string;
  buttonTextColor: string;
  brandName: string;
  /** true sur la slide finale → on affiche le bouton CTA. */
  isCTA: boolean;
}

/** Donnée chiffrée pour le gabarit data-viz : libellé + valeur affichée
 *  (exacte, ex. "9 €") + magnitude numérique (hauteur de barre). */
export interface ChartStat {
  label: string;
  display: string;
  value: number;
}

interface StudioCanvasProps {
  format: StudioFormat;
  displayWidth: number;
  displayHeight: number;
  background: BackgroundSpec;
  brand: BrandKit;
  showLogo: boolean;
  /** Voile de contraste derrière le texte (lisibilité sur fond IA/photo). */
  scrim?: "none" | "dark" | "light";
  /** Côté à assombrir EN PLUS (voile horizontal adaptatif) quand le fond a une
   *  moitié nettement plus claire que l'autre. "none" = pas de voile latéral. */
  scrimSide?: "left" | "right" | "none";
  /** Traitement du fond image : "mono" = noir & blanc éditorial (réf TDAH),
   *  appliqué aux photos de personne générées. "none" = couleur d'origine. */
  bgTreatment?: "none" | "mono";
  initialText?: Partial<Record<TextLayerId, string>>;
  onSelectionChange: (info: SelectionInfo | null) => void;
  onReady?: (handle: StudioCanvasHandle) => void;
}

const isBoldWeight = (w: unknown) => w === "bold" || w === 700 || w === "700";

export function StudioCanvas({
  format,
  displayWidth,
  displayHeight,
  background,
  brand,
  showLogo,
  scrim = "none",
  scrimSide = "none",
  bgTreatment = "none",
  initialText,
  onSelectionChange,
  onReady,
}: StudioCanvasProps) {
  const elRef = useRef<HTMLCanvasElement>(null);
  const fcRef = useRef<Canvas | null>(null);
  const bgRef = useRef<FabricObject | null>(null);
  const logoRef = useRef<FabricObject | null>(null);
  const scrimRef = useRef<FabricObject | null>(null);
  const scrimSideRef = useRef<FabricObject | null>(null);
  // Re-applique la mise en page (safe-zone + empilement) après un changement
  // de format — ne fait rien tant qu'aucune génération n'a placé le texte.
  const layoutRef = useRef<(() => void) | null>(null);

  // Valeurs courantes lues par les méthodes du handle (créé une fois).
  const dimsRef = useRef({ w: displayWidth, h: displayHeight });
  const formatRef = useRef(format);
  const prevDimsRef = useRef({ w: displayWidth, h: displayHeight });
  dimsRef.current = { w: displayWidth, h: displayHeight };
  formatRef.current = format;

  const selCbRef = useRef(onSelectionChange);
  selCbRef.current = onSelectionChange;

  // ── Création du canvas (une seule fois) ───────────────────────
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const canvas = new Canvas(el, {
      width: dimsRef.current.w,
      height: dimsRef.current.h,
      selection: false,
      preserveObjectStacking: true,
    });
    fcRef.current = canvas;

    const reportSelection = () => {
      const obj = canvas.getActiveObject() as Textbox | null;
      if (!obj || (obj as { layerId?: string }).layerId === undefined) {
        selCbRef.current(null);
        return;
      }
      const r = obj.getBoundingRect();
      const editingRange =
        !!obj.isEditing && obj.selectionStart !== obj.selectionEnd;
      let bold: boolean;
      let italic: boolean;
      let underline: boolean;
      let fill: string;
      let fontFamily: string;
      if (editingRange) {
        const styles = obj.getSelectionStyles(obj.selectionStart, obj.selectionEnd, true) as Array<
          Record<string, unknown>
        >;
        const first = styles[0] ?? {};
        bold = isBoldWeight(first.fontWeight ?? obj.fontWeight);
        italic = String(first.fontStyle ?? obj.fontStyle) === "italic";
        underline = Boolean(first.underline ?? obj.underline);
        fill = String(first.fill ?? obj.fill);
        fontFamily = String(first.fontFamily ?? obj.fontFamily);
      } else {
        bold = isBoldWeight(obj.fontWeight);
        italic = obj.fontStyle === "italic";
        underline = Boolean(obj.underline);
        fill = String(obj.fill);
        fontFamily = String(obj.fontFamily);
      }
      selCbRef.current({
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        bold,
        italic,
        underline,
        fill,
        fontFamily,
        align: (obj.textAlign as SelectionInfo["align"]) ?? "center",
        isEditing: !!obj.isEditing,
        selStart: editingRange ? obj.selectionStart : -1,
        selEnd: editingRange ? obj.selectionEnd : -1,
        layerId: String((obj as { layerId?: string }).layerId ?? ""),
      });
    };

    canvas.on("selection:created", reportSelection);
    canvas.on("selection:updated", reportSelection);
    canvas.on("selection:cleared", () => selCbRef.current(null));
    canvas.on("object:moving", reportSelection);
    canvas.on("object:scaling", reportSelection);
    canvas.on("object:modified", reportSelection);
    canvas.on("text:selection:changed", reportSelection);
    canvas.on("text:changed", reportSelection);
    canvas.on("text:editing:entered", reportSelection);
    canvas.on("text:editing:exited", reportSelection);

    // Calques texte initiaux (3) — en coords d'affichage.
    const W = dimsRef.current.w;
    const H = dimsRef.current.h;
    const mk = (
      id: TextLayerId,
      text: string,
      xF: number,
      yF: number,
      wF: number,
      sF: number,
      bold: boolean,
      fill: string,
      opacity: number,
    ) => {
      const tb = new Textbox(text, {
        left: xF * W,
        top: yF * H,
        width: wF * W,
        fontSize: sF * W,
        fontFamily: fontStackFor(brand.font),
        fontWeight: bold ? "bold" : "normal",
        fill,
        opacity,
        textAlign: "center",
        lineHeight: 1.18,
        editable: true,
        selectable: true,
        evented: true,
        objectCaching: false,
      });
      (tb as { layerId?: string }).layerId = id;
      // La textarea cachée de Fabric doit vivre DANS le wrapper du canvas
      // (lui-même dans le Dialog Radix). Par défaut Fabric l'ajoute à
      // document.body → hors du focus-trap du Dialog → le clavier ne
      // l'atteint jamais (la sélection souris marche, mais pas la saisie).
      (tb as unknown as { hiddenTextareaContainer: HTMLElement | null }).hiddenTextareaContainer = canvas.wrapperEl;
      // Texte : on garde seulement les poignées latérales (largeur),
      // pas le scaling par coin (qui déformerait), pas la rotation.
      tb.setControlsVisibility({
        tl: false, tr: false, bl: false, br: false, mt: false, mb: false, mtr: false,
      });
      return tb;
    };

    // Kicker = petites capitales espacées (catégorie / marque), en couleur
    // d'accent, au-dessus du titre (hiérarchie typo "2026").
    const kicker = mk("kicker", initialText?.kicker ?? (brand.name ? brand.name.toUpperCase() : ""), 0.08, 0.05, 0.84, 0.026, true, brand.primaryColor, 0.95);
    kicker.set({ fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif', charSpacing: 140, shadow: "rgba(0,0,0,0.3) 0px 1px 5px" });
    const headline = mk("headline", initialText?.headline ?? "Ton accroche ici", 0.08, 0.11, 0.84, 0.1, true, brand.textColor, 1);
    // Titre = police display lourde + ombre douce (look "2026" out-of-the-box).
    headline.set({ fontFamily: DISPLAY_HEADING_STACK, lineHeight: 1.02, shadow: "rgba(0,0,0,0.35) 0px 2px 12px" });
    // Accent géant = mot/chiffre clé (ex. "16 365€", "STUDIO") en couleur de
    // marque + CONTOUR de contraste (paintFirst stroke) → claque sur n'importe
    // quel fond. Vide par défaut (n'apparaît que si l'IA renvoie un accent).
    const accent = mk("accent", initialText?.accent ?? "", 0.06, 0.5, 0.88, 0.15, true, brand.primaryColor, 1);
    accent.set({ fontFamily: DISPLAY_HEADING_STACK, lineHeight: 0.95, paintFirst: "stroke", stroke: brand.backgroundColor, strokeWidth: 0.006 * W, shadow: "rgba(0,0,0,0.35) 0px 2px 14px" });
    const subline = mk("subline", initialText?.subline ?? "Un sous-titre court qui appuie le bénéfice.", 0.1, 0.34, 0.8, 0.04, false, brand.textColor, 0.82);
    // Sous-titre = sans-serif propre (Montserrat 500) : look SaaS pro, lisible
    // (le script manuscrit faisait "amateur" sur un visuel B2B).
    subline.set({ fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif', fontWeight: "500", fontSize: 0.04 * W, opacity: 0.95, shadow: "rgba(0,0,0,0.3) 0px 1px 6px" });
    const cta = mk("cta", initialText?.cta ?? "Découvre maintenant →", 0.1, 0.84, 0.8, 0.045, true, brand.primaryColor, 1);
    // CTA = bandeau couleur de marque + texte blanc (lisible quel que soit le
    // fond, look "bouton"), en sans-serif gras pour trancher avec le script.
    cta.set({
      fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif',
      fontWeight: "800",
      fill: "#ffffff",
      textBackgroundColor: brand.primaryColor,
    });
    canvas.add(kicker, headline, accent, subline, cta);
    canvas.renderAll();

    // ── Moteur de mise en page (safe-zone + auto-fit + empilement) ──
    // L'ordre vertical des blocs. La taille de police de base est exprimée
    // en FRACTION de la largeur → recalculée à chaque format.
    const LAYOUT_ORDER: string[] = ["kicker", "headline", "accent", "subline", "cta"];
    const BASE_FONT_FRAC: Record<string, number> = {
      kicker: 0.026, headline: 0.092, accent: 0.105, subline: 0.04, cta: 0.045,
    };
    // Canvas détaché pour mesurer la largeur du texte (ctx.measureText).
    const measureCtx = (typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null);

    // État de placement courant (mis à jour par setTextPlacement). Sert à
    // re-stacker à l'identique quand la police ou le format changent.
    let curAnchor: "top" | "center" | "bottom" = "top";
    // Colonne de texte imposée par l'analyse d'image (sujet d'un côté → texte
    // de l'autre). "full" = pleine largeur (gabarit centré/éditorial/carte).
    let curSide: "left" | "right" | "full" = "full";
    // Gabarit + données (data-viz) + couleur de texte courante (pour les
    // libellés du graphe).
    let curTemplate: "auto" | "data" | "beforeAfter" | "carousel" = "auto";
    let curStats: ChartStat[] = [];
    // Paramètres de la slide de carrousel courante (null hors mode carrousel).
    let curCarousel: CarouselRenderParams | null = null;
    let curBefore = "";
    let curAfter = "";
    let curTextColor = brand.textColor;
    // Gabarit courant : centré (hero), aligné à gauche (éditorial), ou carte
    // (panneau semi-opaque derrière le texte → contraste parfait).
    let curAlign: "center" | "left" | "card" = "center";
    let placed = false;
    // Mot d'accent du titre (surligné couleur de marque) + objets décoratifs
    // (color-blocks : pilule de rubrique, badge d'accent) reconstruits à chaque
    // mise en page.
    let headlineAccentWord = "";
    let decorObjs: FabricObject[] = [];

    // Surligne le mot d'accent DANS le titre via un BLOC couleur de marque +
    // texte blanc (style "marqueur"). On utilise un bloc plutôt qu'une simple
    // couleur de texte car une couleur de marque sur un fond de marque (bleu
    // sur bleu) disparaît → le bloc garantit le contraste sur N'IMPORTE quel
    // fond. Styles par caractère (persistent au wrap). Réappliqué à chaque layout.
    const applyHeadlineAccent = () => {
      const cc = fcRef.current;
      if (!cc) return;
      const o = cc.getObjects().find((x) => (x as { layerId?: string }).layerId === "headline") as Textbox | undefined;
      if (!o) return;
      (o as unknown as { styles: object }).styles = {};
      const w = headlineAccentWord.trim();
      const text = String(o.text ?? "");
      if (w) {
        const idx = text.toLowerCase().indexOf(w.toLowerCase());
        if (idx >= 0) {
          // Marqueur VIF (couleur d'accent de marque) + texte FONCÉ, comme un
          // surligneur jaune/fluo sur les réfs (Claude/Insta). Plus fort que le
          // bloc bleu+blanc d'avant.
          const marker = brand.accentColor || brand.primaryColor;
          o.setSelectionStyles({ textBackgroundColor: marker, fill: "#0f172a" }, idx, idx + w.length);
        }
      }
    };

    const widestWord = (text: string) =>
      text.split(/\s+/).reduce((a, w) => (w.length > a.length ? w : a), "");

    // Largeur de la ligne la plus large APRÈS retour à la ligne, mesurée par
    // Fabric (métriques réelles de la police chargée, charSpacing inclus).
    // Filet : si getLineWidth renvoie 0, on re-mesure la ligne via le ctx.
    const longestLineWidth = (o: Textbox): number => {
      const lines = (o as unknown as { textLines?: string[] }).textLines;
      if (!Array.isArray(lines) || !lines.length) return 0;
      let max = 0;
      for (let i = 0; i < lines.length; i++) {
        let w = (o as unknown as { getLineWidth?: (i: number) => number }).getLineWidth?.(i) ?? 0;
        if (!w && measureCtx) {
          const weight = o.fontWeight ? String(o.fontWeight) : "normal";
          measureCtx.font = `${weight} ${o.fontSize ?? 20}px ${o.fontFamily}`;
          w = measureCtx.measureText(lines[i]).width;
        }
        if (w > max) max = w;
      }
      return max;
    };

    // Réduit la fontSize d'un bloc pour qu'il ne déborde JAMAIS de la boîte :
    // l'accent/kicker (1 ligne) doit tenir en entier ; les autres au moins
    // sur leur mot le plus large (Fabric gère le retour à la ligne du reste).
    const fitToWidth = (o: Textbox, boxW: number, singleLine: boolean) => {
      if (!measureCtx) return;
      const text = String(o.text ?? "");
      const target = singleLine ? text : widestWord(text);
      if (!target.trim()) return;
      const weight = o.fontWeight ? String(o.fontWeight) : "normal";
      const size = o.fontSize ?? 20;
      measureCtx.font = `${weight} ${size}px ${o.fontFamily}`;
      const w = measureCtx.measureText(target).width;
      const max = boxW * 0.98;
      if (w > max) o.set({ fontSize: Math.max(8, size * (max / w)) });
    };

    // Couleur + ombre adaptées au fond : ombre FORTE sous un texte clair
    // (fond sombre), DISCRÈTE sous un texte foncé (fond clair).
    const applyColorsAndShadows = (textColor: string) => {
      const cc = fcRef.current;
      if (!cc) return;
      const isLight = textColor.toLowerCase() === "#ffffff";
      const soft = isLight ? "rgba(0,0,0,0.55) 0px 2px 14px" : "rgba(0,0,0,0.18) 0px 1px 5px";
      const kick = isLight ? "rgba(0,0,0,0.5) 0px 1px 6px" : "rgba(0,0,0,0.15) 0px 1px 4px";
      cc.getObjects().forEach((o) => {
        const id = (o as { layerId?: string }).layerId;
        if (id === "headline" || id === "subline") o.set({ fill: textColor, shadow: soft });
        else if (id === "kicker") o.set({ fill: textColor, shadow: kick });
        else if (id === "accent") o.set({ stroke: textColor, shadow: soft });
        // cta : garde son bandeau de marque + texte blanc (lisible partout).
      });
    };

    // Mise en page complète : padding général adapté au format, largeur de
    // boîte commune (force le retour à la ligne), auto-fit anti-débordement,
    // puis empilement vertical sans chevauchement avec espacement constant.
    const layout = () => {
      const cc = fcRef.current;
      if (!cc) return;
      const W = dimsRef.current.w;
      const H = dimsRef.current.h;
      const ratio = W / H;
      const padX = 0.09 * W;
      // PLACEMENT SUJET (photo) : si un sujet occupe une moitié, le texte va sur
      // la moitié OPPOSÉE (colonne ~56 %). Ça PRIME sur le gabarit centré/
      // éditorial/carte (réf photo TDAH : sujet à droite, texte à gauche).
      const sideMode = curSide === "left" || curSide === "right";
      const isLeft = !sideMode && curAlign === "left";
      const isCard = !sideMode && curAlign === "card";
      const leftAligned = isLeft || sideMode;
      let textLeft: number;
      let textW: number;
      if (sideMode) {
        const colW = (W - 2 * padX) * 0.56;
        textLeft = curSide === "left" ? padX : W - padX - colW;
        textW = colW;
      } else {
        const barW = isLeft ? 0.014 * W : 0;
        const colGap = isLeft ? 0.04 * W : 0;
        textLeft = padX + barW + colGap;
        textW = W - textLeft - padX;
      }
      const barW = isLeft ? 0.014 * W : 0;
      const align: "left" | "center" = leftAligned ? "left" : "center";
      const FIT = 0.96;
      const maxLine = textW * FIT;
      // Marges verticales adaptées au format (plus aérées en portrait/story).
      const padTop = (ratio >= 1 ? 0.08 : 0.06) * H;
      const padBottom = (ratio >= 1 ? 0.08 : 0.07) * H;

      // Repart d'une ardoise propre côté décorations (reconstruites en fin).
      if (decorObjs.length) {
        decorObjs.forEach((d) => cc.remove(d));
        decorObjs = [];
      }

      const objs = LAYOUT_ORDER.map(
        (id) => cc.getObjects().find((o) => (o as { layerId?: string }).layerId === id) as Textbox | undefined,
      );
      // (1) Safe-zone : colonne de texte commune + alignement du template.
      objs.forEach((o) => o?.set({ left: textLeft, width: textW, textAlign: align }));

      const blocks = LAYOUT_ORDER
        .map((id, i) => ({ id, o: objs[i] }))
        .filter((b): b is { id: string; o: Textbox } => !!b.o && String(b.o.text ?? "").trim().length > 0);
      if (!blocks.length) return;

      // (2) Auto-fit largeur. On repart de la taille de base, on pré-réduit
      // l'accent/kicker (1 ligne), puis — FILET DE SÉCURITÉ toutes polices —
      // on mesure ITÉRATIVEMENT la ligne réellement la plus large après wrap
      // et on réduit tant qu'elle dépasse (le wrap change à chaque passe). Ça
      // garantit qu'aucune ligne ne touche le bord, quelle que soit la police.
      // Nombre de lignes MAX par bloc : un titre ne doit pas se déployer sur 5
      // lignes et bouffer tout le visuel (ex. couvrir un visage). Réduire la
      // police fait tenir plus de mots par ligne → moins de lignes.
      const MAX_LINES: Record<string, number> = { kicker: 1, headline: 3, accent: 1, subline: 2, cta: 1 };
      blocks.forEach(({ id, o }) => {
        const frac = BASE_FONT_FRAC[id];
        if (frac) o.set({ fontSize: frac * W });
        fitToWidth(o, maxLine, id === "accent" || id === "kicker");
        // (a) largeur : aucune ligne ne dépasse la colonne.
        for (let pass = 0; pass < 4; pass++) {
          o.initDimensions();
          const lw = longestLineWidth(o);
          if (lw <= maxLine) break;
          o.set({ fontSize: Math.max(8, (o.fontSize ?? 20) * (maxLine / lw)) });
        }
        // (b) hauteur : on plafonne le nombre de lignes.
        const maxL = MAX_LINES[id];
        if (maxL) {
          for (let pass = 0; pass < 6; pass++) {
            o.initDimensions();
            const lines = (o as unknown as { textLines?: string[] }).textLines?.length ?? 1;
            if (lines <= maxL) break;
            o.set({ fontSize: Math.max(8, (o.fontSize ?? 20) * 0.92) });
          }
        }
      });

      // (3) Hauteurs + espacements GROUPÉS : le kicker colle au titre, et on
      // aère entre les groupes (rythme vertical "pro", pas un bloc uniforme).
      const gapFor = (prevId: string, id: string) => {
        if (id === "headline" && prevId === "kicker") return 0.012 * H;
        if (id === "cta") return 0.05 * H;
        return 0.032 * H;
      };
      const gaps = blocks.map((b, i) => (i === 0 ? 0 : gapFor(blocks[i - 1].id, b.id)));
      const sumGaps = gaps.reduce((a, b) => a + b, 0);
      // Rembourrage vertical des color-blocks (pilule/badge/bouton) — DOIT
      // matcher les padVk passés à placeBehind. On l'intègre à l'empreinte de
      // chaque bloc pour que l'empilement réserve la place du bloc coloré
      // (sinon le bouton CTA empiète sur le sous-titre).
      const decorPadVk = (id: string) => {
        if (id === "accent") return 0.18;
        if (id === "cta") return 0.32;
        if (id === "kicker" && !leftAligned) return 0.34;
        return 0;
      };
      blocks.forEach(({ o }) => o.initDimensions());
      let heights = blocks.map(({ o }) => o.getScaledHeight());
      let padVs = blocks.map(({ id, o }) => decorPadVk(id) * o.getScaledHeight());
      const footprint = () => heights.reduce((s, h, i) => s + h + 2 * padVs[i], 0) + sumGaps;
      let total = footprint();
      const availH = H - padTop - padBottom;
      // (3b) Débordement vertical → réduit tout proportionnellement.
      if (total > availH) {
        const k = availH / total;
        blocks.forEach(({ o }) => o.set({ fontSize: (o.fontSize ?? 20) * k }));
        blocks.forEach(({ o }) => o.initDimensions());
        heights = blocks.map(({ o }) => o.getScaledHeight());
        padVs = blocks.map(({ id, o }) => decorPadVk(id) * o.getScaledHeight());
        total = footprint();
      }

      // (4) Empilement : ancré en haut, centré, ou en bas (espacements groupés).
      // Le texte est décalé de son padV pour que le color-block démarre au bon Y.
      let y =
        curAnchor === "top"
          ? padTop
          : curAnchor === "center"
            ? Math.max(padTop, (H - total) / 2)
            : Math.max(padTop, H - padBottom - total);
      blocks.forEach(({ o }, i) => {
        y += gaps[i];
        o.set({ top: y + padVs[i] });
        o.setCoords();
        y += heights[i] + 2 * padVs[i];
      });

      // (5) DÉCORATIONS (color-blocks), adaptées à l'alignement : pilule de
      // rubrique, badge "prix", bouton CTA plein, barre d'accent (mode gauche).
      const findBlock = (id: string) => blocks.find((b) => b.id === id)?.o;
      const placeBehind = (o: Textbox, padHk: number, padVk: number, radius: number, fill: string) => {
        o.initDimensions();
        const tw = longestLineWidth(o);
        const hh = o.getScaledHeight();
        const padH = padHk * hh;
        const padV = padVk * hh;
        let bw = tw + 2 * padH;
        let left: number;
        if (leftAligned) {
          left = textLeft - padH;
          bw = Math.min(bw, W - padX - left);
        } else {
          bw = Math.min(bw, W - 2 * padX);
          left = W / 2 - bw / 2;
        }
        const bh = hh + 2 * padV;
        const rect = new Rect({
          left,
          top: (o.top ?? 0) - padV,
          width: bw,
          height: bh,
          rx: radius * bh,
          ry: radius * bh,
          fill,
          selectable: false,
          evented: false,
          objectCaching: false,
        });
        (rect as { layerId?: string }).layerId = undefined;
        cc.add(rect);
        decorObjs.push(rect);
      };

      const kk = findBlock("kicker");
      if (kk && !leftAligned) {
        // Centré : pilule de rubrique (texte blanc sur bloc marque).
        placeBehind(kk, 0.7, 0.34, 0.5, brand.primaryColor);
        kk.set({ fill: "#ffffff", shadow: "" });
      }
      // Éditorial (gauche) : pas de pilule, le kicker garde sa couleur adaptée
      // (lisible) et la barre d'accent verticale porte le brand.
      const ac = findBlock("accent");
      if (ac) {
        placeBehind(ac, 0.34, 0.18, 0.16, brand.primaryColor); // badge prix
        ac.set({ fill: "#ffffff", stroke: "", shadow: "rgba(0,0,0,0.28) 0px 3px 10px" });
      }
      const ct = findBlock("cta");
      if (ct) {
        // Vrai BOUTON plein arrondi (au lieu du bandeau "texte surligné").
        // Rembourrage modéré : sur 2 lignes + padV 0.5 il devenait un pavé
        // géant qui empiétait sur le sous-titre (cta plafonné à 1 ligne désormais).
        ct.set({ textBackgroundColor: "" });
        placeBehind(ct, 0.6, 0.32, 0.5, brand.primaryColor);
        ct.set({ fill: "#ffffff", shadow: "" });
      }
      // Barre d'accent verticale (mode éditorial), le long du bloc de texte.
      if (isLeft) {
        const core = blocks.filter((b) => b.id !== "cta");
        if (core.length) {
          const t0 = core[0].o.top ?? 0;
          const last = core[core.length - 1].o;
          const bBottom = (last.top ?? 0) + last.getScaledHeight();
          const bar = new Rect({
            left: padX,
            top: t0,
            width: barW,
            height: Math.max(1, bBottom - t0),
            rx: barW / 2,
            ry: barW / 2,
            fill: brand.primaryColor,
            selectable: false,
            evented: false,
            objectCaching: false,
          });
          (bar as { layerId?: string }).layerId = undefined;
          cc.add(bar);
          decorObjs.push(bar);
        }
      }

      // Gabarit CARTE : texte blanc (le panneau garantit le contraste), filet
      // d'accent discret sous le titre, et panneau semi-opaque derrière tout.
      if (isCard) {
        blocks.forEach(({ id, o }) => {
          if (id === "headline" || id === "subline") o.set({ fill: "#ffffff", shadow: "rgba(0,0,0,0.4) 0px 2px 8px" });
        });
        const hIdx = blocks.findIndex((b) => b.id === "headline");
        if (hIdx >= 0 && blocks[hIdx + 1]) {
          const hb = blocks[hIdx].o;
          const ruleY = ((hb.top ?? 0) + hb.getScaledHeight() + (blocks[hIdx + 1].o.top ?? 0)) / 2;
          const ruleW = 0.12 * W;
          const ruleH = 0.008 * W;
          const rule = new Rect({
            left: W / 2 - ruleW / 2, top: ruleY - ruleH / 2, width: ruleW, height: ruleH,
            rx: ruleH / 2, ry: ruleH / 2, fill: brand.primaryColor,
            selectable: false, evented: false, objectCaching: false,
          });
          (rule as { layerId?: string }).layerId = undefined;
          cc.add(rule);
          decorObjs.push(rule);
        }
        // Panneau poussé EN DERNIER → reste au fond des décos (sous pilule/badge/
        // bouton/filet), au-dessus du fond + voile.
        const maxLineW = Math.max(...blocks.map(({ o }) => longestLineWidth(o)));
        const cardPadH = 0.06 * W;
        const cardPadV = 0.05 * H;
        const cardW = Math.min(W - 2 * padX, maxLineW + 2 * cardPadH);
        const t0 = blocks[0].o.top ?? 0;
        const lastO = blocks[blocks.length - 1].o;
        const b0 = (lastO.top ?? 0) + lastO.getScaledHeight();
        const panel = new Rect({
          left: W / 2 - cardW / 2, top: t0 - cardPadV, width: cardW, height: (b0 - t0) + 2 * cardPadV,
          rx: 0.045 * W, ry: 0.045 * W, fill: "rgba(13,18,38,0.55)",
          selectable: false, evented: false, objectCaching: false,
        });
        (panel as { layerId?: string }).layerId = undefined;
        cc.add(panel);
        decorObjs.push(panel);
      }

      // Surlignage du mot d'accent dans le titre (bloc marque + texte blanc).
      applyHeadlineAccent();

      // (6) Z-order : fond → voiles → décorations → textes (+ logo au-dessus).
      decorObjs.forEach((d) => cc.sendObjectToBack(d));
      if (scrimSideRef.current) cc.sendObjectToBack(scrimSideRef.current);
      if (scrimRef.current) cc.sendObjectToBack(scrimRef.current);
      if (bgRef.current) cc.sendObjectToBack(bgRef.current);

      cc.requestRenderAll();
    };

    // ── Gabarit DATA-VIZ : titre en haut, BARRES comparatives au centre,
    // sous-titre/source + CTA bouton en bas. Données = curStats (chiffres réels
    // du post). La barre de la marque est en couleur de marque, les autres en
    // gris → la comparaison raconte l'histoire (réf Attac).
    const layoutData = () => {
      const cc = fcRef.current;
      if (!cc) return;
      const W = dimsRef.current.w;
      const H = dimsRef.current.h;
      const padX = 0.08 * W;
      const boxW = W - 2 * padX;
      const maxLine = boxW * 0.96;
      if (decorObjs.length) { decorObjs.forEach((d) => cc.remove(d)); decorObjs = []; }

      const get = (id: string) => cc.getObjects().find((o) => (o as { layerId?: string }).layerId === id) as Textbox | undefined;
      get("accent")?.set({ text: "" }); // pas de badge en data-viz

      const MAXL: Record<string, number> = { kicker: 1, headline: 3, subline: 2, cta: 1 };
      const prep = (id: string): Textbox | undefined => {
        const o = get(id);
        if (!o || !String(o.text ?? "").trim()) return undefined;
        o.set({ left: padX, width: boxW, textAlign: "center" });
        const frac = BASE_FONT_FRAC[id];
        if (frac) o.set({ fontSize: frac * W });
        fitToWidth(o, maxLine, id === "kicker");
        for (let p = 0; p < 4; p++) { o.initDimensions(); const lw = longestLineWidth(o); if (lw <= maxLine) break; o.set({ fontSize: Math.max(8, (o.fontSize ?? 20) * (maxLine / lw)) }); }
        const maxl = MAXL[id];
        if (maxl) for (let p = 0; p < 6; p++) { o.initDimensions(); const lines = (o as unknown as { textLines?: string[] }).textLines?.length ?? 1; if (lines <= maxl) break; o.set({ fontSize: Math.max(8, (o.fontSize ?? 20) * 0.92) }); }
        o.initDimensions();
        return o;
      };
      const kicker = prep("kicker");
      const headline = prep("headline");
      const subline = prep("subline");
      const cta = prep("cta");

      const chip = (o: Textbox, padHk: number, padVk: number, radius: number, fill: string) => {
        o.initDimensions();
        const tw = longestLineWidth(o);
        const hh = o.getScaledHeight();
        const padH = padHk * hh, padV = padVk * hh;
        const bw = Math.min(tw + 2 * padH, W - 2 * padX);
        const bh = hh + 2 * padV;
        const r = new Rect({ left: W / 2 - bw / 2, top: (o.top ?? 0) - padV, width: bw, height: bh, rx: radius * bh, ry: radius * bh, fill, selectable: false, evented: false, objectCaching: false });
        (r as { layerId?: string }).layerId = undefined;
        cc.add(r); decorObjs.push(r);
      };
      const mkLabel = (text: string, left: number, top: number, width: number, size: number, weight: string, fill: string, family?: string) => {
        const t = new Textbox(text, { left, top, width, fontSize: size, textAlign: "center", fill, fontWeight: weight, fontFamily: family ?? 'Montserrat, "Helvetica Neue", Arial, sans-serif', selectable: false, evented: false, objectCaching: false, lineHeight: 1.05 });
        (t as { layerId?: string }).layerId = undefined;
        cc.add(t); decorObjs.push(t);
        return t;
      };

      // Groupe HAUT : kicker (pilule) + titre, ancrés en haut.
      let yT = 0.07 * H;
      if (kicker) {
        const kpadV = 0.34 * kicker.getScaledHeight();
        kicker.set({ top: yT + kpadV });
        kicker.setCoords();
        chip(kicker, 0.7, 0.34, 0.5, brand.primaryColor);
        kicker.set({ fill: "#ffffff", shadow: "" });
        yT = (kicker.top ?? 0) + kicker.getScaledHeight() + kpadV + 0.02 * H;
      }
      if (headline) {
        headline.set({ top: yT });
        headline.setCoords();
        yT += headline.getScaledHeight();
      }
      const topBottom = yT;

      // Groupe BAS : CTA bouton tout en bas, sous-titre/source au-dessus.
      let yB = H - 0.07 * H;
      if (cta) {
        const cpadV = 0.32 * cta.getScaledHeight();
        cta.set({ top: yB - cta.getScaledHeight() - cpadV });
        cta.setCoords();
        cta.set({ textBackgroundColor: "" });
        chip(cta, 0.6, 0.32, 0.5, brand.primaryColor);
        cta.set({ fill: "#ffffff", shadow: "" });
        yB = (cta.top ?? 0) - cpadV - 0.03 * H;
      }
      if (subline) {
        subline.set({ top: yB - subline.getScaledHeight() });
        subline.setCoords();
        yB = (subline.top ?? 0) - 0.02 * H;
      }
      const bottomTop = yB;

      // RÉGION GRAPHE entre les 2 groupes.
      const chartTop = topBottom + 0.05 * H;
      const chartBottom = bottomTop - 0.03 * H;
      const chartH = Math.max(0.12 * H, chartBottom - chartTop);
      const n = curStats.length;
      const slotW = boxW / n;
      const barW = Math.min(slotW * 0.5, 0.18 * W);
      const valH = 0.06 * H;
      const catH = 0.05 * H;
      const baseline = chartTop + chartH - catH;
      const usableH = Math.max(0.05 * H, chartH - valH - catH);
      const maxVal = Math.max(...curStats.map((s) => s.value), 1);
      const anyBrand = !!brand.name && curStats.some((s) => s.label.toLowerCase().includes(brand.name.toLowerCase()));
      const headingFam = headline ? String(headline.fontFamily) : 'Montserrat, sans-serif';
      curStats.forEach((s, i) => {
        const cx = padX + slotW * (i + 0.5);
        const barH = Math.max(0.02 * H, (s.value / maxVal) * usableH);
        const isBrandBar = anyBrand ? s.label.toLowerCase().includes(brand.name.toLowerCase()) : true;
        const fill = isBrandBar ? brand.primaryColor : "#94a3b8";
        const bar = new Rect({ left: cx - barW / 2, top: baseline - barH, width: barW, height: barH, rx: 0.012 * W, ry: 0.012 * W, fill, selectable: false, evented: false, objectCaching: false });
        (bar as { layerId?: string }).layerId = undefined;
        cc.add(bar); decorObjs.push(bar);
        // valeur (display) au-dessus de la barre, en gros (police titre).
        mkLabel(s.display, cx - slotW / 2, baseline - barH - valH, slotW, 0.052 * W, "800", curTextColor, headingFam);
        // libellé de catégorie sous la ligne de base.
        mkLabel(s.label, cx - slotW / 2, baseline + 0.01 * H, slotW, 0.026 * W, "600", curTextColor);
      });

      applyHeadlineAccent();

      // Z-order : fond → voiles → graphe/déco → textes restants.
      decorObjs.forEach((d) => cc.sendObjectToBack(d));
      if (scrimSideRef.current) cc.sendObjectToBack(scrimSideRef.current);
      if (scrimRef.current) cc.sendObjectToBack(scrimRef.current);
      if (bgRef.current) cc.sendObjectToBack(bgRef.current);
      cc.requestRenderAll();
    };

    // ── Gabarit AVANT/APRÈS : titre en haut, DEUX panneaux contrastés (Avant
    // sombre ✕ / marque ✓), bouton CTA en bas. Le contraste raconte la
    // transformation (réf avant/après). Reproductible sur tous les formats.
    const layoutBeforeAfter = () => {
      const cc = fcRef.current;
      if (!cc) return;
      const W = dimsRef.current.w;
      const H = dimsRef.current.h;
      const padX = 0.08 * W;
      const boxW = W - 2 * padX;
      const maxLine = boxW * 0.96;
      if (decorObjs.length) { decorObjs.forEach((d) => cc.remove(d)); decorObjs = []; }

      const get = (id: string) => cc.getObjects().find((o) => (o as { layerId?: string }).layerId === id) as Textbox | undefined;
      get("accent")?.set({ text: "" });
      get("subline")?.set({ text: "" }); // les panneaux portent le message

      const MAXL: Record<string, number> = { kicker: 1, headline: 3, cta: 1 };
      const prep = (id: string): Textbox | undefined => {
        const o = get(id);
        if (!o || !String(o.text ?? "").trim()) return undefined;
        o.set({ left: padX, width: boxW, textAlign: "center" });
        const frac = BASE_FONT_FRAC[id];
        if (frac) o.set({ fontSize: frac * W });
        fitToWidth(o, maxLine, id === "kicker");
        for (let p = 0; p < 4; p++) { o.initDimensions(); const lw = longestLineWidth(o); if (lw <= maxLine) break; o.set({ fontSize: Math.max(8, (o.fontSize ?? 20) * (maxLine / lw)) }); }
        const maxl = MAXL[id];
        if (maxl) for (let p = 0; p < 6; p++) { o.initDimensions(); const lines = (o as unknown as { textLines?: string[] }).textLines?.length ?? 1; if (lines <= maxl) break; o.set({ fontSize: Math.max(8, (o.fontSize ?? 20) * 0.92) }); }
        o.initDimensions();
        return o;
      };
      const kicker = prep("kicker");
      const headline = prep("headline");
      const cta = prep("cta");

      const chip = (o: Textbox, padHk: number, padVk: number, radius: number, fill: string) => {
        o.initDimensions();
        const tw = longestLineWidth(o), hh = o.getScaledHeight();
        const padH = padHk * hh, padV = padVk * hh;
        const bw = Math.min(tw + 2 * padH, W - 2 * padX), bh = hh + 2 * padV;
        const r = new Rect({ left: W / 2 - bw / 2, top: (o.top ?? 0) - padV, width: bw, height: bh, rx: radius * bh, ry: radius * bh, fill, selectable: false, evented: false, objectCaching: false });
        (r as { layerId?: string }).layerId = undefined; cc.add(r); decorObjs.push(r);
      };
      const mkText = (text: string, width: number, size: number, weight: string, fill: string, family?: string, spacing?: number) => {
        const t = new Textbox(text, { left: 0, top: 0, width, fontSize: size, textAlign: "left", fill, fontWeight: weight, fontFamily: family ?? 'Montserrat, "Helvetica Neue", Arial, sans-serif', charSpacing: spacing ?? 0, selectable: false, evented: false, objectCaching: false, lineHeight: 1.12 });
        (t as { layerId?: string }).layerId = undefined; cc.add(t); decorObjs.push(t);
        t.initDimensions();
        return t;
      };

      // Groupe haut : kicker (pilule) + titre.
      let yT = 0.07 * H;
      if (kicker) {
        const kpadV = 0.34 * kicker.getScaledHeight();
        kicker.set({ top: yT + kpadV }); kicker.setCoords();
        chip(kicker, 0.7, 0.34, 0.5, brand.primaryColor);
        kicker.set({ fill: "#ffffff", shadow: "" });
        yT = (kicker.top ?? 0) + kicker.getScaledHeight() + kpadV + 0.02 * H;
      }
      if (headline) { headline.set({ top: yT }); headline.setCoords(); yT += headline.getScaledHeight(); }
      const topBottom = yT;

      // CTA bouton en bas.
      let ctaTop = H - 0.07 * H;
      if (cta) {
        const cpadV = 0.32 * cta.getScaledHeight();
        cta.set({ top: H - 0.07 * H - cta.getScaledHeight() - cpadV }); cta.setCoords();
        cta.set({ textBackgroundColor: "" });
        chip(cta, 0.6, 0.32, 0.5, brand.primaryColor);
        cta.set({ fill: "#ffffff", shadow: "" });
        ctaTop = (cta.top ?? 0) - cpadV;
      }

      // Deux panneaux entre les deux groupes.
      const innerPadX = 0.045 * W, innerPadY = 0.028 * W, tagGap = 0.012 * H;
      const sides = [
        { tag: "✕  AVANT", text: curBefore, fill: "rgba(2,6,23,0.55)", tagFill: "#fca5a5" },
        { tag: "✓  " + (brand.name ? brand.name.toUpperCase() : "APRÈS"), text: curAfter, fill: brand.primaryColor, tagFill: "#ffffff" },
      ];
      const built = sides.map((s) => {
        const tag = mkText(s.tag, boxW - 2 * innerPadX, 0.024 * W, "800", s.tagFill, undefined, 60);
        const body = mkText(s.text, boxW - 2 * innerPadX, 0.044 * W, "700", "#ffffff");
        for (let p = 0; p < 5; p++) { body.initDimensions(); const lines = (body as unknown as { textLines?: string[] }).textLines?.length ?? 1; if (lines <= 3) break; body.set({ fontSize: Math.max(8, (body.fontSize ?? 20) * 0.92) }); }
        body.initDimensions();
        const h = innerPadY * 2 + tag.getScaledHeight() + tagGap + body.getScaledHeight();
        return { s, tag, body, h };
      });
      const gapP = 0.025 * H;
      const totalP = built.reduce((a, b) => a + b.h, 0) + gapP;
      let py = Math.max(topBottom + 0.04 * H, (topBottom + 0.04 * H + ctaTop - 0.03 * H) / 2 - totalP / 2);
      built.forEach(({ s, tag, body, h }) => {
        const rect = new Rect({ left: padX, top: py, width: boxW, height: h, rx: 0.03 * W, ry: 0.03 * W, fill: s.fill, selectable: false, evented: false, objectCaching: false });
        (rect as { layerId?: string }).layerId = undefined; cc.add(rect); decorObjs.push(rect);
        tag.set({ left: padX + innerPadX, top: py + innerPadY }); tag.setCoords();
        body.set({ left: padX + innerPadX, top: py + innerPadY + tag.getScaledHeight() + tagGap }); body.setCoords();
        py += h + gapP;
      });

      applyHeadlineAccent();
      // Z-order : panneaux/textes au-dessus du fond+voiles. Les rects de
      // panneau sont créés AVANT leurs textes → restent derrière eux après
      // sendToBack (et les panneaux ne se chevauchent pas spatialement).
      decorObjs.forEach((d) => cc.sendObjectToBack(d));
      if (scrimSideRef.current) cc.sendObjectToBack(scrimSideRef.current);
      if (scrimRef.current) cc.sendObjectToBack(scrimRef.current);
      if (bgRef.current) cc.sendObjectToBack(bgRef.current);
      cc.requestRenderAll();
    };

    // Fond UNI plein (flat) posé directement sur le canvas, sans passer par
    // l'état React `background` — indispensable pour l'export séquentiel du
    // carrousel (changer 10 fonds en boucle sans attendre un re-render).
    const ensureSolidBg = (color: string) => {
      const cc = fcRef.current;
      if (!cc) return;
      const existing = bgRef.current;
      if (existing && (existing as FabricObject).type === "rect") {
        (existing as Rect).set({ fill: color, width: dimsRef.current.w, height: dimsRef.current.h });
        cc.sendObjectToBack(existing);
        return;
      }
      if (existing) cc.remove(existing);
      const rect = new Rect({ left: 0, top: 0, width: dimsRef.current.w, height: dimsRef.current.h, selectable: false, evented: false });
      rect.set("fill", color);
      (rect as { layerId?: string }).layerId = undefined;
      bgRef.current = rect;
      cc.add(rect);
      cc.sendObjectToBack(rect);
    };

    // ── Gabarit CARROUSEL : slide FLAT (réf prompt Béné). Fond de marque uni,
    // AUCUNE ombre, AUCUN gradient, AUCUNE pilule. Tag (kicker) + titre + ligne
    // de soutien empilés au centre, footer "marque · 0X/NN", bouton CTA plein
    // sur la dernière slide. Les couleurs (fond/texte/accent/bouton) sont
    // calculées par l'hôte depuis le brand kit et passées via setCarousel.
    const layoutCarousel = () => {
      const cc = fcRef.current;
      if (!cc || !curCarousel) return;
      const p = curCarousel;
      const W = dimsRef.current.w;
      const H = dimsRef.current.h;
      const padX = 0.1 * W;
      const boxW = W - 2 * padX;
      const maxLine = boxW * 0.98;
      ensureSolidBg(p.bg);
      if (decorObjs.length) { decorObjs.forEach((d) => cc.remove(d)); decorObjs = []; }

      const get = (id: string) => cc.getObjects().find((o) => (o as { layerId?: string }).layerId === id) as Textbox | undefined;
      get("accent")?.set({ text: "" }); // pas de badge chiffre en carrousel

      // Calques cœur : kicker (tag), headline, subline. CTA géré en bouton.
      const FRAC: Record<string, number> = { kicker: 0.03, headline: 0.085, subline: 0.04 };
      const MAXL: Record<string, number> = { kicker: 1, headline: 4, subline: 4 };
      const isList = String(get("subline")?.text ?? "").includes("\n"); // slide takeaway
      const prep = (id: string, align: "left" | "center"): Textbox | undefined => {
        const o = get(id);
        if (!o || !String(o.text ?? "").trim()) return undefined;
        o.set({ left: padX, width: boxW, textAlign: align, shadow: "", textBackgroundColor: "", lineHeight: id === "headline" ? 1.05 : 1.3 });
        const frac = FRAC[id];
        if (frac) o.set({ fontSize: frac * W });
        if (id === "kicker") o.set({ charSpacing: 160, fontWeight: "700", fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif' });
        if (id === "subline") o.set({ fontWeight: "500", fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif' });
        fitToWidth(o, maxLine, id === "kicker");
        for (let pass = 0; pass < 4; pass++) { o.initDimensions(); const lw = longestLineWidth(o); if (lw <= maxLine) break; o.set({ fontSize: Math.max(8, (o.fontSize ?? 20) * (maxLine / lw)) }); }
        const maxl = MAXL[id];
        if (maxl) for (let pass = 0; pass < 6; pass++) { o.initDimensions(); const lines = (o as unknown as { textLines?: string[] }).textLines?.length ?? 1; if (lines <= maxl) break; o.set({ fontSize: Math.max(8, (o.fontSize ?? 20) * 0.92) }); }
        o.initDimensions();
        return o;
      };

      const align: "left" | "center" = isList ? "left" : "center";
      const kicker = prep("kicker", align);
      const headline = prep("headline", align);
      const subline = prep("subline", align);
      kicker?.set({ fill: p.accentColor });
      headline?.set({ fill: p.textColor });
      subline?.set({ fill: p.textColor, opacity: 0.9 });

      // CTA = vrai bouton plein (flat) sur la dernière slide.
      const ctaLayer = get("cta");
      const hasCta = !!(p.isCTA && ctaLayer && String(ctaLayer.text ?? "").trim());
      if (hasCta && ctaLayer) {
        ctaLayer.set({ left: padX, width: boxW, textAlign: "center", shadow: "", textBackgroundColor: "", fontWeight: "800", fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif', fill: p.buttonTextColor, fontSize: 0.045 * W });
        for (let pass = 0; pass < 4; pass++) { ctaLayer.initDimensions(); const lw = longestLineWidth(ctaLayer); if (lw <= maxLine * 0.9) break; ctaLayer.set({ fontSize: Math.max(8, (ctaLayer.fontSize ?? 20) * 0.92) }); }
        ctaLayer.initDimensions();
      } else {
        ctaLayer?.set({ text: "" });
      }

      // Empilement vertical centré (entre header de footer haut et bas).
      const core = [kicker, headline, subline].filter((o): o is Textbox => !!o);
      const gap = 0.03 * H;
      const ctaH = hasCta && ctaLayer ? ctaLayer.getScaledHeight() + 0.68 * ctaLayer.getScaledHeight() + 0.09 * H : 0;
      const totalCore = core.reduce((s, o) => s + o.getScaledHeight(), 0) + gap * Math.max(0, core.length - 1);
      const blockH = totalCore + ctaH;
      let y = Math.max(0.12 * H, (H - blockH) / 2);
      core.forEach((o, i) => {
        if (i > 0) y += gap;
        o.set({ top: y });
        o.setCoords();
        y += o.getScaledHeight();
      });

      // Bouton CTA juste sous le bloc.
      if (hasCta && ctaLayer) {
        y += 0.05 * H;
        const padV = 0.34 * ctaLayer.getScaledHeight();
        const padH = 0.7 * ctaLayer.getScaledHeight();
        const tw = longestLineWidth(ctaLayer);
        const bw = Math.min(tw + 2 * padH, W - 2 * padX);
        const bh = ctaLayer.getScaledHeight() + 2 * padV;
        ctaLayer.set({ left: W / 2 - boxW / 2, width: boxW, top: y + padV });
        ctaLayer.setCoords();
        const rect = new Rect({ left: W / 2 - bw / 2, top: y, width: bw, height: bh, rx: bh / 2, ry: bh / 2, fill: p.buttonColor, selectable: false, evented: false, objectCaching: false });
        (rect as { layerId?: string }).layerId = undefined;
        cc.add(rect);
        decorObjs.push(rect);
      }

      // Footer : marque (gauche) + "0X/NN" (droite), discret.
      const footY = H - 0.07 * H;
      const footSize = 0.026 * W;
      const mkFoot = (text: string, left: number, width: number, textAlign: "left" | "right") => {
        const tb = new Textbox(text, { left, top: footY, width, fontSize: footSize, textAlign, fill: p.textColor, opacity: 0.6, fontWeight: "700", charSpacing: 60, fontFamily: 'Montserrat, "Helvetica Neue", Arial, sans-serif', selectable: false, evented: false, objectCaching: false });
        (tb as { layerId?: string }).layerId = undefined;
        cc.add(tb);
        decorObjs.push(tb);
      };
      if (p.brandName) mkFoot(p.brandName.toUpperCase(), padX, boxW * 0.6, "left");
      const num = `${String(p.index + 1).padStart(2, "0")}/${String(p.total).padStart(2, "0")}`;
      mkFoot(num, W - padX - boxW * 0.4, boxW * 0.4, "right");

      // Z-order : fond → décorations (bouton/footer) → textes cœur.
      decorObjs.forEach((d) => cc.sendObjectToBack(d));
      if (bgRef.current) cc.sendObjectToBack(bgRef.current);
      cc.requestRenderAll();
    };

    // Dispatcher : choisit le gabarit selon le template + données disponibles.
    const render = () => {
      if (curTemplate === "carousel" && curCarousel) layoutCarousel();
      else if (curTemplate === "data" && curStats.length >= 2) layoutData();
      else if (curTemplate === "beforeAfter" && curBefore && curAfter) layoutBeforeAfter();
      else layout();
    };

    // Re-stacke quand les webfonts sont prêtes (métriques fiables) puis expose
    // un re-layout au changement de format (seulement après une génération).
    // CAUSE RACINE du texte qui débordait : Fabric garde un cache GLOBAL des
    // largeurs de glyphes par police. Si la webfont n'est pas encore chargée au
    // 1er rendu, il mémorise les largeurs de la police de SECOURS (plus
    // étroites) sous la clé de la vraie police → tous les calculs suivants (même
    // initDimensions) réutilisent ces largeurs fausses → retour à la ligne et
    // mesures erronées. La parade documentée : VIDER ce cache global une fois
    // les polices chargées, puis re-mesurer (initDimensions) et re-empiler.
    const familyToken = (stack: string) => stack.split(",")[0].trim().replace(/^["']|["']$/g, "");
    const layoutNow = () => {
      render();
      if (typeof document === "undefined" || !document.fonts) return;
      const fams = new Set<string>();
      fcRef.current?.getObjects().forEach((o) => {
        const ff = (o as Textbox).fontFamily;
        if (typeof ff === "string") fams.add(familyToken(ff));
      });
      const loads = [...fams].flatMap((fam) =>
        ["400", "500", "600", "700", "800", "900"].map((w) =>
          document.fonts.load(`${w} 48px "${fam}"`).catch(() => []),
        ),
      );
      Promise.all(loads)
        .then(() => document.fonts.ready)
        .then(() => {
          cache.clearFontCache();
          fcRef.current?.getObjects().forEach((o) => {
            const t = o as Textbox;
            if (typeof t.initDimensions === "function") t.initDimensions();
          });
          render();
        })
        .catch(() => {});
    };
    layoutRef.current = () => {
      if (placed) layoutNow();
    };

    const handle: StudioCanvasHandle = {
      async toBlob() {
        const c = fcRef.current;
        if (!c) throw new Error("Canvas non prêt");
        if (c.getActiveObject()) c.discardActiveObject();
        // NB : on NE relance PAS la mise en page ici — l'utilisateur a pu
        // déplacer le texte à la main après génération, on respecte ses
        // positions. L'anti-débordement a déjà eu lieu à la génération
        // (layout + chargement des polices).
        c.renderAll();
        const multiplier = formatRef.current.width / dimsRef.current.w;
        const dataUrl = c.toDataURL({ format: "png", multiplier });
        const res = await fetch(dataUrl);
        return await res.blob();
      },
      getSelectionRange() {
        const c = fcRef.current;
        const obj = c?.getActiveObject() as Textbox | null;
        if (!obj || !obj.isEditing) return null;
        if (obj.selectionStart === obj.selectionEnd) return null;
        return { start: obj.selectionStart, end: obj.selectionEnd };
      },
      applyStyle(patch, range) {
        const c = fcRef.current;
        const obj = c?.getActiveObject() as Textbox | null;
        if (!c || !obj) return;
        const useRange = range ?? (obj.isEditing && obj.selectionStart !== obj.selectionEnd
          ? { start: obj.selectionStart, end: obj.selectionEnd }
          : null);

        if (patch.fontFamily !== undefined) {
          if (useRange) obj.setSelectionStyles({ fontFamily: patch.fontFamily }, useRange.start, useRange.end);
          else obj.set({ fontFamily: patch.fontFamily });
        }
        if (patch.fill !== undefined) {
          if (useRange) obj.setSelectionStyles({ fill: patch.fill }, useRange.start, useRange.end);
          else obj.set({ fill: patch.fill });
        }
        if (patch.toggleBold) {
          if (useRange) {
            const styles = obj.getSelectionStyles(useRange.start, useRange.end, true) as Array<Record<string, unknown>>;
            const allBold = styles.length > 0 && styles.every((s) => isBoldWeight(s.fontWeight ?? obj.fontWeight));
            obj.setSelectionStyles({ fontWeight: allBold ? "normal" : "bold" }, useRange.start, useRange.end);
          } else {
            obj.set({ fontWeight: isBoldWeight(obj.fontWeight) ? "normal" : "bold" });
          }
        }
        if (patch.toggleItalic) {
          if (useRange) {
            const styles = obj.getSelectionStyles(useRange.start, useRange.end, true) as Array<Record<string, unknown>>;
            const allItalic = styles.length > 0 && styles.every((s) => String(s.fontStyle ?? obj.fontStyle) === "italic");
            obj.setSelectionStyles({ fontStyle: allItalic ? "normal" : "italic" }, useRange.start, useRange.end);
          } else {
            obj.set({ fontStyle: obj.fontStyle === "italic" ? "normal" : "italic" });
          }
        }
        if (patch.toggleUnderline) {
          if (useRange) {
            const styles = obj.getSelectionStyles(useRange.start, useRange.end, true) as Array<Record<string, unknown>>;
            const allUnder = styles.length > 0 && styles.every((s) => Boolean(s.underline ?? obj.underline));
            obj.setSelectionStyles({ underline: !allUnder }, useRange.start, useRange.end);
          } else {
            obj.set({ underline: !obj.underline });
          }
        }
        if (patch.align) obj.set({ textAlign: patch.align });
        if (patch.fontDelta) {
          obj.set({ fontSize: Math.max(8, (obj.fontSize ?? 20) + patch.fontDelta) });
        }
        c.requestRenderAll();
        reportSelection();
      },
      enterEdit() {
        const c = fcRef.current;
        const obj = c?.getActiveObject() as Textbox | null;
        if (!c || !obj) return;
        obj.enterEditing();
        obj.selectAll();
        c.requestRenderAll();
        reportSelection();
      },
      deleteActive() {
        const c = fcRef.current;
        const obj = c?.getActiveObject();
        if (!c || !obj) return;
        c.remove(obj);
        c.discardActiveObject();
        c.requestRenderAll();
        selCbRef.current(null);
      },
      addText() {
        const c = fcRef.current;
        if (!c) return;
        const W2 = dimsRef.current.w;
        const tb = new Textbox("Nouveau texte", {
          left: W2 * 0.12,
          top: dimsRef.current.h * 0.45,
          width: W2 * 0.76,
          fontSize: W2 * 0.05,
          fontFamily: fontStackFor(brand.font),
          fill: brand.textColor,
          textAlign: "center",
          lineHeight: 1.18,
          editable: true,
          selectable: true,
          evented: true,
          objectCaching: false,
        });
        (tb as { layerId?: string }).layerId = `extra-${Date.now()}`;
        (tb as unknown as { hiddenTextareaContainer: HTMLElement | null }).hiddenTextareaContainer = c.wrapperEl;
        tb.setControlsVisibility({ tl: false, tr: false, bl: false, br: false, mt: false, mb: false, mtr: false });
        c.add(tb);
        c.setActiveObject(tb);
        c.requestRenderAll();
        reportSelection();
      },
      setLayerText(id, text) {
        const c = fcRef.current;
        if (!c) return;
        const obj = c
          .getObjects()
          .find((o) => (o as { layerId?: string }).layerId === id) as Textbox | undefined;
        if (!obj) return;
        obj.set({ text });
        c.requestRenderAll();
      },
      setTextPlacement(anchor, textColor, textSide) {
        if (!fcRef.current) return;
        curAnchor = anchor;
        curSide = textSide === "left" || textSide === "right" ? textSide : "full";
        curTextColor = textColor;
        placed = true;
        applyColorsAndShadows(textColor);
        layoutNow();
      },
      setTemplate(template) {
        curTemplate =
          template === "data" || template === "beforeAfter" || template === "carousel"
            ? template
            : "auto";
        layoutNow();
      },
      setCarousel(params) {
        curCarousel = params;
        curTemplate = "carousel";
        placed = true; // permet les re-layout au changement de format
        layoutNow();
      },
      getLayerText(id) {
        const c = fcRef.current;
        if (!c) return "";
        const obj = c.getObjects().find((o) => (o as { layerId?: string }).layerId === id) as Textbox | undefined;
        return String(obj?.text ?? "");
      },
      setStats(stats) {
        curStats = Array.isArray(stats) ? stats.slice(0, 4) : [];
        layoutNow();
      },
      setBeforeAfter(before, after) {
        curBefore = (before ?? "").trim();
        curAfter = (after ?? "").trim();
        layoutNow();
      },
      setHeadingFont(stack) {
        const c = fcRef.current;
        if (!c) return;
        // Graisse par police : les fontes déjà "black"/condensées (Archivo
        // Black, Anton, Bebas) NE doivent PAS recevoir de gras (fabric génère
        // un faux-gras illisible). Les autres prennent un vrai 800.
        const fam = stack.toLowerCase();
        const weight = /archivo black|anton|bebas|impact/.test(fam) ? "normal" : "800";
        c.getObjects().forEach((o) => {
          const id = (o as { layerId?: string }).layerId;
          if (id === "headline" || id === "accent") o.set({ fontFamily: stack, fontWeight: weight });
        });
        layoutNow();
      },
      highlightHeadline(word) {
        headlineAccentWord = (word ?? "").trim();
        applyHeadlineAccent();
        fcRef.current?.requestRenderAll();
      },
      setAlign(align) {
        curAlign = align === "left" || align === "card" ? align : "center";
        layoutNow();
      },
    };
    onReady?.(handle);

    // Le Dialog s'ouvre avec une animation (zoom/translate). Si Fabric
    // mesure le canvas pendant l'animation, l'offset de hit-detection est
    // figé au mauvais endroit → les clics sont décalés et seuls les
    // éléments du haut répondent (bug "seul le titre est sélectionnable").
    // On re-synchronise dimensions + offset une fois la mise en page stable.
    const resync = () => {
      const c = fcRef.current;
      if (!c) return;
      c.setDimensions({ width: dimsRef.current.w, height: dimsRef.current.h });
      c.calcOffset();
      c.requestRenderAll();
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(resync));
    const t1 = setTimeout(resync, 250);
    window.addEventListener("resize", resync);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      window.removeEventListener("resize", resync);
      canvas.dispose();
      fcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dimensions / changement de format : rescale les calques ───
  useEffect(() => {
    const c = fcRef.current;
    if (!c) return;
    const prev = prevDimsRef.current;
    const rx = displayWidth / prev.w;
    const ry = displayHeight / prev.h;
    c.setDimensions({ width: displayWidth, height: displayHeight });
    if (rx !== 1 || ry !== 1) {
      c.getObjects().forEach((o) => {
        if ((o as { layerId?: string }).layerId === undefined) return;
        o.set({
          left: (o.left ?? 0) * rx,
          top: (o.top ?? 0) * ry,
          width: (o.width ?? 0) * rx,
          fontSize: ((o as Textbox).fontSize ?? 20) * rx,
        });
        o.setCoords();
      });
    }
    prevDimsRef.current = { w: displayWidth, h: displayHeight };
    c.calcOffset();
    c.requestRenderAll();
    // Replace le texte selon le NOUVEAU format (no-op avant une génération).
    layoutRef.current?.();
  }, [displayWidth, displayHeight]);

  // ── Fond (uni / dégradé / image) ──────────────────────────────
  useEffect(() => {
    const c = fcRef.current;
    if (!c) return;
    let cancelled = false;

    if (bgRef.current) {
      c.remove(bgRef.current);
      bgRef.current = null;
    }

    const place = (obj: FabricObject) => {
      if (cancelled) return;
      (obj as { layerId?: string }).layerId = undefined;
      obj.set({ selectable: false, evented: false });
      bgRef.current = obj;
      c.add(obj);
      c.sendObjectToBack(obj);
      c.requestRenderAll();
    };

    if (background.mode === "image" && background.imageUrl) {
      FabricImage.fromURL(background.imageUrl, { crossOrigin: "anonymous" })
        .then((img) => {
          if (cancelled || !img.width || !img.height) return;
          const scale = Math.max(displayWidth / img.width, displayHeight / img.height);
          img.set({
            scaleX: scale,
            scaleY: scale,
            left: (displayWidth - img.width * scale) / 2,
            top: (displayHeight - img.height * scale) / 2,
          });
          // N&B éditorial (réf TDAH) : grayscale + léger contraste sur les
          // photos de personne → look premium et cohérent, texte plus lisible.
          if (bgTreatment === "mono") {
            img.filters = [new filters.Grayscale(), new filters.Contrast({ contrast: 0.12 })];
            img.applyFilters();
          }
          place(img);
        })
        .catch(() => {});
    } else {
      const rect = new Rect({ left: 0, top: 0, width: displayWidth, height: displayHeight });
      if (background.mode === "gradient") {
        rect.set(
          "fill",
          new Gradient({
            type: "linear",
            coords: { x1: 0, y1: 0, x2: 0, y2: displayHeight },
            colorStops: [
              { offset: 0, color: background.color },
              { offset: 1, color: background.color2 || background.color },
            ],
          }),
        );
      } else {
        rect.set("fill", background.color);
      }
      place(rect);
    }

    return () => {
      cancelled = true;
    };
  }, [background, displayWidth, displayHeight, bgTreatment]);

  // ── Voile de contraste (lisibilité du texte sur fond photo/IA) ──
  // Deux couches possibles, JUSTE au-dessus du fond, sous le texte :
  //  1. VERTICALE : dense en haut (titre) et en bas (CTA) + un voile de base
  //     au centre (sinon un dégradé s'annule là où le texte se trouve).
  //  2. HORIZONTALE (adaptative) : assombrit le côté NETTEMENT plus clair de
  //     l'image → contraste homogène sur tout le texte, sans bicoloration.
  // Dépend de `background` pour se re-stacker après tout changement de fond.
  useEffect(() => {
    const c = fcRef.current;
    if (!c) return;
    if (scrimRef.current) { c.remove(scrimRef.current); scrimRef.current = null; }
    if (scrimSideRef.current) { c.remove(scrimSideRef.current); scrimSideRef.current = null; }

    const mkRect = (grad: Gradient<"linear">) => {
      const rect = new Rect({ left: 0, top: 0, width: displayWidth, height: displayHeight, selectable: false, evented: false });
      rect.set("fill", grad);
      (rect as { layerId?: string }).layerId = undefined;
      c.add(rect);
      return rect;
    };

    if (scrim !== "none") {
      const base = scrim === "dark" ? "0,0,0" : "255,255,255";
      scrimRef.current = mkRect(new Gradient({
        type: "linear",
        coords: { x1: 0, y1: 0, x2: 0, y2: displayHeight },
        colorStops: [
          { offset: 0, color: `rgba(${base},0.62)` },
          { offset: 0.4, color: `rgba(${base},0.14)` },
          { offset: 0.6, color: `rgba(${base},0.14)` },
          { offset: 1, color: `rgba(${base},0.64)` },
        ],
      }));
    }

    // Voile latéral : seulement en mode sombre (texte blanc) et si un côté est
    // marqué comme plus clair. On assombrit ce côté pour égaliser le contraste.
    if (scrim === "dark" && scrimSide !== "none") {
      const darkenRight = scrimSide === "right";
      scrimSideRef.current = mkRect(new Gradient({
        type: "linear",
        coords: { x1: 0, y1: 0, x2: displayWidth, y2: 0 },
        colorStops: darkenRight
          ? [ { offset: 0, color: "rgba(0,0,0,0)" }, { offset: 0.55, color: "rgba(0,0,0,0.1)" }, { offset: 1, color: "rgba(0,0,0,0.5)" } ]
          : [ { offset: 0, color: "rgba(0,0,0,0.5)" }, { offset: 0.45, color: "rgba(0,0,0,0.1)" }, { offset: 1, color: "rgba(0,0,0,0)" } ],
      }));
    }

    // Ordre arrière→avant : fond → voile vertical → voile latéral → texte.
    if (scrimSideRef.current) c.sendObjectToBack(scrimSideRef.current);
    if (scrimRef.current) c.sendObjectToBack(scrimRef.current);
    if (bgRef.current) c.sendObjectToBack(bgRef.current);
    c.requestRenderAll();
  }, [scrim, scrimSide, background, displayWidth, displayHeight]);

  // ── Logo ──────────────────────────────────────────────────────
  useEffect(() => {
    const c = fcRef.current;
    if (!c) return;
    let cancelled = false;

    if (logoRef.current) {
      c.remove(logoRef.current);
      logoRef.current = null;
    }
    if (!showLogo || !brand.logoUrl) {
      c.requestRenderAll();
      return;
    }

    FabricImage.fromURL(brand.logoUrl, { crossOrigin: "anonymous" })
      .then((img) => {
        if (cancelled || !img.width) return;
        const targetW = displayWidth * 0.26;
        const scale = targetW / img.width;
        img.set({
          scaleX: scale,
          scaleY: scale,
          left: (displayWidth - targetW) / 2,
          top: displayHeight * 0.04,
          selectable: false,
          evented: false,
        });
        (img as { layerId?: string }).layerId = undefined;
        logoRef.current = img;
        c.add(img);
        c.requestRenderAll();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [showLogo, brand.logoUrl, displayWidth, displayHeight]);

  // Redraw quand les webfonts sont prêtes (sinon métriques sur fallback).
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.ready) return;
    let alive = true;
    fonts.ready.then(() => {
      if (alive) fcRef.current?.requestRenderAll();
    });
    return () => {
      alive = false;
    };
  }, []);

  return <canvas ref={elRef} />;
}
