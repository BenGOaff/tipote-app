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
import { Canvas, Textbox, Rect, FabricImage, Gradient } from "fabric";
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
  /** Place le bloc texte en haut ou en bas (selon l'analyse d'image) et
   *  applique la couleur adaptée au titre/sous-titre. */
  setTextPlacement: (anchor: "top" | "bottom", textColor: string) => void;
  /** Change la police du titre + de l'accent (adaptée au thème/style). */
  setHeadingFont: (stack: string) => void;
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
  initialText,
  onSelectionChange,
  onReady,
}: StudioCanvasProps) {
  const elRef = useRef<HTMLCanvasElement>(null);
  const fcRef = useRef<Canvas | null>(null);
  const bgRef = useRef<FabricObject | null>(null);
  const logoRef = useRef<FabricObject | null>(null);
  const scrimRef = useRef<FabricObject | null>(null);
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
    // Sous-titre = script (Caveat), plus grand : look "accroche manuscrite"
    // (ex. "Comment le reconnaître ?") qui contraste avec le titre display.
    subline.set({ fontFamily: '"Caveat", "Comic Sans MS", cursive', fontSize: 0.062 * W, opacity: 0.95, shadow: "rgba(0,0,0,0.3) 0px 1px 6px" });
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
      kicker: 0.026, headline: 0.1, accent: 0.15, subline: 0.062, cta: 0.045,
    };
    // Canvas détaché pour mesurer la largeur du texte (ctx.measureText).
    const measureCtx = (typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null);

    // État de placement courant (mis à jour par setTextPlacement). Sert à
    // re-stacker à l'identique quand la police ou le format changent.
    let curAnchor: "top" | "bottom" = "top";
    let placed = false;

    const widestWord = (text: string) =>
      text.split(/\s+/).reduce((a, w) => (w.length > a.length ? w : a), "");

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
      const padX = 0.07 * W;
      const boxW = W - 2 * padX;
      // Marges verticales adaptées au format (plus aérées en portrait/story).
      const padTop = (ratio >= 1 ? 0.08 : 0.06) * H;
      const padBottom = (ratio >= 1 ? 0.08 : 0.07) * H;
      const gap = 0.025 * H;

      const objs = LAYOUT_ORDER.map(
        (id) => cc.getObjects().find((o) => (o as { layerId?: string }).layerId === id) as Textbox | undefined,
      );
      // (1) Safe-zone : même largeur + marge gauche pour tous (padding général).
      objs.forEach((o) => o?.set({ left: padX, width: boxW }));

      const blocks = LAYOUT_ORDER
        .map((id, i) => ({ id, o: objs[i] }))
        .filter((b): b is { id: string; o: Textbox } => !!b.o && String(b.o.text ?? "").trim().length > 0);
      if (!blocks.length) return;

      // (2) Auto-fit : taille de base puis réduction si un mot/accent déborde.
      blocks.forEach(({ id, o }) => {
        const frac = BASE_FONT_FRAC[id];
        if (frac) o.set({ fontSize: frac * W });
        fitToWidth(o, boxW, id === "accent" || id === "kicker");
      });

      // (3) Mesure les hauteurs réelles.
      blocks.forEach(({ o }) => o.initDimensions());
      let heights = blocks.map(({ o }) => o.getScaledHeight());
      let total = heights.reduce((a, b) => a + b, 0) + gap * Math.max(0, blocks.length - 1);
      const availH = H - padTop - padBottom;
      // (3b) Débordement vertical → réduit tout proportionnellement.
      if (total > availH) {
        const k = availH / total;
        blocks.forEach(({ o }) => o.set({ fontSize: (o.fontSize ?? 20) * k }));
        blocks.forEach(({ o }) => o.initDimensions());
        heights = blocks.map(({ o }) => o.getScaledHeight());
        total = heights.reduce((a, b) => a + b, 0) + gap * Math.max(0, blocks.length - 1);
      }

      // (4) Empilement, ancré en haut ou en bas.
      let y = curAnchor === "top" ? padTop : Math.max(padTop, H - padBottom - total);
      blocks.forEach(({ o }, i) => {
        o.set({ top: y });
        o.setCoords();
        y += heights[i] + gap;
      });
      cc.requestRenderAll();
    };

    // Re-stacke quand les webfonts sont prêtes (métriques fiables) puis expose
    // un re-layout au changement de format (seulement après une génération).
    const layoutNow = () => {
      layout();
      if (typeof document !== "undefined" && document.fonts?.ready) {
        document.fonts.ready.then(layout).catch(() => {});
      }
    };
    layoutRef.current = () => {
      if (placed) layoutNow();
    };

    const handle: StudioCanvasHandle = {
      async toBlob() {
        const c = fcRef.current;
        if (!c) throw new Error("Canvas non prêt");
        if (c.getActiveObject()) c.discardActiveObject();
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
      setTextPlacement(anchor, textColor) {
        if (!fcRef.current) return;
        curAnchor = anchor;
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
  // Dégradé vertical : plus dense en haut (titre) et en bas (CTA),
  // transparent au milieu. Placé JUSTE au-dessus du fond, sous le texte.
  // Dépend de `background` pour se re-stacker après tout changement de fond.
  useEffect(() => {
    const c = fcRef.current;
    if (!c) return;
    if (scrimRef.current) {
      c.remove(scrimRef.current);
      scrimRef.current = null;
    }
    if (scrim !== "none") {
      const base = scrim === "dark" ? "0,0,0" : "255,255,255";
      const grad = new Gradient({
        type: "linear",
        coords: { x1: 0, y1: 0, x2: 0, y2: displayHeight },
        colorStops: [
          { offset: 0, color: `rgba(${base},0.5)` },
          { offset: 0.3, color: `rgba(${base},0)` },
          { offset: 0.7, color: `rgba(${base},0)` },
          { offset: 1, color: `rgba(${base},0.55)` },
        ],
      });
      const rect = new Rect({
        left: 0,
        top: 0,
        width: displayWidth,
        height: displayHeight,
        selectable: false,
        evented: false,
      });
      rect.set("fill", grad);
      (rect as { layerId?: string }).layerId = undefined;
      scrimRef.current = rect;
      c.add(rect);
      // Ordre : fond (0) → voile (1) → texte/logo au-dessus.
      c.sendObjectToBack(rect);
      if (bgRef.current) c.sendObjectToBack(bgRef.current);
    }
    c.requestRenderAll();
  }, [scrim, background, displayWidth, displayHeight]);

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
