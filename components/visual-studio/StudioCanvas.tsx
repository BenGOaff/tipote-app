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
import { Canvas, Textbox, Rect, FabricImage, Gradient, cache } from "fabric";
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
      kicker: 0.026, headline: 0.1, accent: 0.105, subline: 0.04, cta: 0.045,
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
      layout();
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
          layout();
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
        placed = true;
        applyColorsAndShadows(textColor);
        layoutNow();
      },
      setHeadingFont(stack) {
        const c = fcRef.current;
        if (!c) return;
        c.getObjects().forEach((o) => {
          const id = (o as { layerId?: string }).layerId;
          if (id === "headline" || id === "accent") o.set({ fontFamily: stack });
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
  }, [background, displayWidth, displayHeight]);

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
