"use client";

// Canvas Konva du Studio visuels. Chargé UNIQUEMENT côté client
// (next/dynamic ssr:false depuis ImageStudio) car Konva touche `window`.
//
// Principe d'échelle : le Stage est dimensionné à la taille d'AFFICHAGE
// (calculée pour tenir dans maxWidth×maxHeight), et un Layer scalé dessine
// les éléments en coordonnées de RENDU (1080×…). À l'export on applique
// pixelRatio = renderWidth/displayWidth pour sortir le PNG pleine résolution.

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import type { BackgroundSpec, BrandKit, StudioFormat, TextLayer } from "@/lib/visualStudio/types";

export interface StudioCanvasHandle {
  /** Exporte le visuel courant en PNG pleine résolution (renderWidth×renderHeight). */
  toBlob: () => Promise<Blob>;
}

interface StudioCanvasProps {
  format: StudioFormat;
  background: BackgroundSpec;
  layers: TextLayer[];
  brand: BrandKit;
  showLogo: boolean;
  maxWidth: number;
  maxHeight: number;
  /** Remontée d'un déplacement de calque (en fractions). */
  onLayerMove: (id: TextLayer["id"], xFrac: number, yFrac: number) => void;
  /**
   * Expose la poignée d'export au parent. On passe par un callback plutôt
   * qu'une ref car react-konva est chargé via next/dynamic(ssr:false) et
   * le forward-ref ne traverse pas le wrapper dynamic de façon fiable.
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

/** Couvre la zone (w×h) en gardant le ratio de l'image (équivalent object-fit: cover). */
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
  background,
  layers,
  brand,
  showLogo,
  maxWidth,
  maxHeight,
  onLayerMove,
  onReady,
}: StudioCanvasProps) {
    const stageRef = useRef<Konva.Stage>(null);

    // Dimensions d'affichage : on tient dans la boîte en gardant le ratio.
    const ratio = format.width / format.height;
    let displayWidth = maxWidth;
    let displayHeight = displayWidth / ratio;
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * ratio;
    }
    const scale = displayWidth / format.width;

    const bgImage = useHtmlImage(background.mode === "image" ? background.imageUrl : null);
    const logoImage = useHtmlImage(showLogo ? brand.logoUrl : null);

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

    const fontFamily = brand.font || "Inter";

    // Logo en haut-centre, largeur = 26% de la largeur de rendu.
    const logoW = format.width * 0.26;
    const logoH = logoImage ? (logoImage.height / logoImage.width) * logoW : 0;

    return (
      <Stage
        ref={stageRef}
        width={displayWidth}
        height={displayHeight}
        style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.12)" }}
      >
        <Layer scaleX={scale} scaleY={scale}>
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

          {/* Calques texte (déplaçables) */}
          {layers
            .filter((l) => l.enabled && l.text.trim())
            .map((l) => (
              <Text
                key={l.id}
                text={l.text}
                x={l.xFrac * format.width}
                y={l.yFrac * format.height}
                width={l.widthFrac * format.width}
                fontSize={l.fontScale * format.width}
                fontFamily={fontFamily}
                fontStyle={l.fontStyle}
                fill={l.fill}
                opacity={l.opacity}
                align={l.align}
                wrap="word"
                lineHeight={1.18}
                draggable
                onDragEnd={(e) => {
                  onLayerMove(l.id, e.target.x() / format.width, e.target.y() / format.height);
                }}
              />
            ))}
        </Layer>
      </Stage>
    );
}
