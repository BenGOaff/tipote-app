// components/quiz/QuizPanelMedia.tsx
"use client";

// Panneau decoratif de la disposition "colonnes" (split). Rend un Item de
// media resolu : couleur pleine, degrade (QUIZ_GRADIENTS), image (cover) ou
// motif (canvas dessine via le port fidele de drawMotif). Le panneau ne
// contient JAMAIS le titre du quiz. Un discret wordmark/marque en haut a
// gauche est possible (optionnel), comme dans le mockup.
//
// SSR-safe : le <canvas> est rendu vide cote serveur, le motif est peint au
// mount (useEffect) et re-peint au resize.

import { useEffect, useRef } from "react";
import { QUIZ_GRADIENTS, type PanelMediaItem } from "@/lib/quizBranding";
import { drawMotif } from "@/lib/panelMotif";

export function QuizPanelMedia({
  item,
  brandColor,
  wordmark,
  logoUrl,
  className,
  style,
}: {
  item: PanelMediaItem;
  brandColor: string;
  /** Petit texte de marque en haut a gauche (optionnel). Jamais le titre. */
  wordmark?: string | null;
  /** Logo de marque (optionnel). Prioritaire sur le wordmark. */
  logoUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isMotif = item.type === "motif";
  const motif = item.motif ?? "mesh";
  const motifColor = item.motifColor || brandColor;

  useEffect(() => {
    if (!isMotif) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const paint = () => drawMotif(cv, motif, motifColor);
    // rAF pour laisser le layout se stabiliser (getBoundingClientRect fiable).
    const raf = requestAnimationFrame(paint);
    window.addEventListener("resize", paint);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", paint);
    };
  }, [isMotif, motif, motifColor]);

  // Fond selon le type. Motif/image utilisent des surfaces dediees.
  let background: string | undefined;
  if (item.type === "color") {
    background = item.color || brandColor;
  } else if (item.type === "gradient") {
    background = (item.gradient && QUIZ_GRADIENTS[item.gradient]) || brandColor;
  }

  const isImage = item.type === "image" && !!item.imageUrl;

  return (
    <div
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{
        ...(background ? { background } : undefined),
        ...(isImage
          ? {
              backgroundImage: `url("${item.imageUrl}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined),
        ...style,
      }}
    >
      {isMotif && (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" aria-hidden />
      )}
      {/* Marque discrete en haut a gauche (jamais le titre). */}
      {(logoUrl || wordmark) && (
        <div className="absolute left-4 top-3.5 z-10 flex items-center gap-2">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt="" className="max-h-8 w-auto object-contain drop-shadow" />
          ) : (
            <span className="text-white font-extrabold text-sm drop-shadow" style={{ textShadow: "0 1px 4px rgba(0,0,0,.25)" }}>
              {wordmark}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
