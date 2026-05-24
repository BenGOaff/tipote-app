"use client";

// Canvas Konva du Studio visuels. Chargé UNIQUEMENT côté client
// (next/dynamic ssr:false depuis ImageStudio) car Konva touche `window`.
//
// WYSIWYG : on édite directement sur le visuel. Le canvas gère la
// sélection (clic), l'entrée en édition (double-clic) et le déplacement
// (drag) des calques texte, et REMONTE la position écran de l'élément
// sélectionné. La barre d'outils flottante + le champ d'édition inline
// sont rendus en HTML par ImageStudio, ancrés sur cette position.
//
// Échelle : Stage = taille d'AFFICHAGE (fournie par le parent via
// fitDisplay), Layer scalé, calques en coords de RENDU (1080×…). Export
// pleine résolution via pixelRatio = renderWidth/displayWidth.

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type {
  BackgroundSpec,
  BrandKit,
  StudioFormat,
  TextLayer,
  TextLayerId,
} from "@/lib/visualStudio/types";

export interface StudioCanvasHandle {
  /** Exporte le visuel courant en PNG pleine résolution (renderWidth×renderHeight). */
  toBlob: () => Promise<Blob>;
}

/** Rectangle en pixels d'AFFICHAGE, relatif au coin haut-gauche du Stage. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface StudioCanvasProps {
  format: StudioFormat;
  displayWidth: number;
  displayHeight: number;
  background: BackgroundSpec;
  layers: TextLayer[];
  brand: BrandKit;
  showLogo: boolean;
  selectedId: TextLayerId | null;
  editingId: TextLayerId | null;
  onSelect: (id: TextLayerId | null) => void;
  onRequestEdit: (id: TextLayerId) => void;
  /** Position écran du calque sélectionné (null = rien de sélectionné). */
  onSelectedRect: (rect: ScreenRect | null) => void;
  onLayerMove: (id: TextLayerId, xFrac: number, yFrac: number) => void;
  /**
   * Expose la poignée d'export. Callback plutôt que ref : react-konva est
   * chargé via next/dynamic(ssr:false) et le forward-ref ne traverse pas
   * le wrapper dynamic de façon fiable.
   */
  onReady?: (handle: StudioCanvasHandle) => void;
}

function useHtmlImage(src?: string | null): HTMLImageElement | null {
  // On stocke {src, img} et on DÉRIVE le retour : pas de setState synchrone
  // dans l'effet (le setState n'a lieu que dans le callback `load`).
  const [loaded, setLoaded] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!src) return;
    const image = new window.Image();
    // Indispensable pour exporter le canvas sans le "tainter" quand le
    // fond/logo vient d'une autre origine (videos.tipote.com expose ACAO *).
    image.crossOrigin = "anonymous";
    const onLoad = () => setLoaded({ src, img: image });
    image.addEventListener("load", onLoad);
    image.src = src;
    return () => image.removeEventListener("load", onLoad);
  }, [src]);
  return src && loaded?.src === src ? loaded.img : null;
}

/** Couvre la zone (w×h) en gardant le ratio de l'image (object-fit: cover). */
function coverRect(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; width: number; height: number } {
  if (!imgW || !imgH) return { x: 0, y: 0, width: boxW, height: boxH };
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}

export function StudioCanvas({
  format,
  displayWidth,
  displayHeight,
  background,
  layers,
  brand,
  showLogo,
  selectedId,
  editingId,
  onSelect,
  onRequestEdit,
  onSelectedRect,
  onLayerMove,
  onReady,
}: StudioCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const nodesRef = useRef<Map<TextLayerId, Konva.Text>>(new Map());
  const lastRectKey = useRef<string>("");

  const scale = displayWidth / format.width;
  const bgImage = useHtmlImage(background.mode === "image" ? background.imageUrl : null);
  const logoImage = useHtmlImage(showLogo ? brand.logoUrl : null);

  // Remonte la position écran du calque (dé-doublonnée pour éviter les
  // boucles de rendu). onSelectedRect est un callback parent, pas un
  // setState local → conforme à react-hooks/set-state-in-effect.
  const reportRect = useCallback(
    (id: TextLayerId | null) => {
      const node = id ? nodesRef.current.get(id) : null;
      const stage = stageRef.current;
      if (!node || !stage) {
        if (lastRectKey.current !== "null") {
          lastRectKey.current = "null";
          onSelectedRect(null);
        }
        return;
      }
      const r = node.getClientRect({ relativeTo: stage });
      const key = `${r.x}|${r.y}|${r.width}|${r.height}`;
      if (key !== lastRectKey.current) {
        lastRectKey.current = key;
        onSelectedRect({ left: r.x, top: r.y, width: r.width, height: r.height });
      }
    },
    [onSelectedRect],
  );

  // Recalcule la position quand la sélection, les calques, le format ou
  // l'échelle changent (ex: après changement de taille de police).
  useEffect(() => {
    reportRect(selectedId);
  }, [selectedId, layers, format, displayWidth, editingId, reportRect]);

  const exportPng = useCallback(async (): Promise<Blob> => {
    const stage = stageRef.current;
    if (!stage) throw new Error("Canvas non prêt");
    const canvas = stage.toCanvas({ pixelRatio: format.width / displayWidth });
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Export PNG échoué"))),
        "image/png",
      );
    });
  }, [format.width, displayWidth]);

  useEffect(() => {
    onReady?.({ toBlob: exportPng });
  }, [onReady, exportPng]);

  // Si une vraie webfont se charge après le 1er rendu, on force un redraw
  // pour que Konva recalcule les métriques (sinon rendu avec le fallback).
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts?.ready) return;
    let alive = true;
    fonts.ready.then(() => {
      if (alive) layerRef.current?.draw();
    });
    return () => {
      alive = false;
    };
  }, []);

  const logoW = format.width * 0.26;
  const logoH = logoImage ? (logoImage.height / logoImage.width) * logoW : 0;

  return (
    <Stage
      ref={stageRef}
      width={displayWidth}
      height={displayHeight}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
      onTouchStart={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
      style={{ borderRadius: 12, overflow: "hidden" }}
    >
      <Layer ref={layerRef} scaleX={scale} scaleY={scale}>
        {/* Fond */}
        {background.mode === "gradient" ? (
          <Rect
            x={0}
            y={0}
            width={format.width}
            height={format.height}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: format.height }}
            fillLinearGradientColorStops={[0, background.color, 1, background.color2 || background.color]}
          />
        ) : (
          <Rect x={0} y={0} width={format.width} height={format.height} fill={background.color} />
        )}

        {background.mode === "image" && bgImage && (
          <KonvaImage
            image={bgImage}
            {...coverRect(bgImage.width, bgImage.height, format.width, format.height)}
            listening={false}
          />
        )}

        {/* Logo */}
        {showLogo && logoImage && (
          <KonvaImage
            image={logoImage}
            x={(format.width - logoW) / 2}
            y={format.height * 0.04}
            width={logoW}
            height={logoH}
            listening={false}
          />
        )}

        {/* Calques texte — WYSIWYG : sélection / double-clic édition / drag */}
        {layers
          .filter((l) => l.enabled && l.text.trim())
          .map((l) => (
            <Text
              key={l.id}
              ref={(node) => {
                if (node) nodesRef.current.set(l.id, node);
                else nodesRef.current.delete(l.id);
              }}
              text={l.text}
              x={l.xFrac * format.width}
              y={l.yFrac * format.height}
              width={l.widthFrac * format.width}
              fontSize={l.fontScale * format.width}
              fontFamily={l.fontFamily}
              fontStyle={l.fontStyle}
              fill={l.fill}
              opacity={l.opacity}
              align={l.align}
              wrap="word"
              lineHeight={1.18}
              visible={editingId !== l.id}
              draggable
              onClick={() => onSelect(l.id)}
              onTap={() => onSelect(l.id)}
              onDblClick={() => onRequestEdit(l.id)}
              onDblTap={() => onRequestEdit(l.id)}
              onDragMove={() => reportRect(l.id)}
              onDragEnd={(e) => {
                onLayerMove(l.id, e.target.x() / format.width, e.target.y() / format.height);
                reportRect(l.id);
              }}
            />
          ))}
      </Layer>
    </Stage>
  );
}
