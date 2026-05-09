"use client";

// PopquizLivePreview — aperçu temps réel de ce que verront les
// visiteurs du popquiz, partagé entre la page de création et la
// page d'édition. Toggle "lien direct" / "iframe" pour comparer
// les 2 rendus sans naviguer.
//
// Le rendu est intentionnellement contraint dans un container
// scrollable plutôt qu'en plein écran — on simule la page publique
// dans un cadre, ce qui permet de l'afficher dans le sticky-aperçu
// du WYSIWYG sans monopoliser l'écran.
//
// Mode "direct" : reproduit /pq/[id] avec titre, sous-titre,
// branding créateur, fond personnalisé, footer "via Tiquiz".
// Mode "iframe" : reproduit /embed/pq/[id] — vidéo seule + footer
// Tiquiz, pas de titre/sous-titre/fond/branding.

import Image from "next/image";
import { useState } from "react";
import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import {
  buildPlayerWrapperClassName,
  buildPlayerWrapperStyle,
  buildPageBackgroundStyle,
  tiquizDiscoveryUrl,
} from "@/lib/popquiz/appearance";
import type { Popquiz } from "@/lib/popquiz";
import { Eye, Link as LinkIcon, Square as SquareIcon } from "lucide-react";

function prettyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface Props {
  popquiz: Popquiz;
}

type Mode = "direct" | "iframe";

export function PopquizLivePreview({ popquiz }: Props) {
  const [mode, setMode] = useState<Mode>("direct");
  const { branding, appearance } = popquiz;

  const wrapperClassName = buildPlayerWrapperClassName(appearance);
  const wrapperStyle = buildPlayerWrapperStyle(appearance);
  const pageBgStyle =
    mode === "direct"
      ? buildPageBackgroundStyle(appearance)
      : { background: "transparent" };

  const heading = mode === "direct" ? appearance.displayTitle?.trim() : null;
  const subheading =
    mode === "direct" ? appearance.displaySubtitle?.trim() : null;
  const showBranding = mode === "direct" && appearance.showCreatorBranding;

  return (
    <div className="space-y-2">
      {/* Toggle direct / iframe */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground mr-1">
          <Eye className="size-3.5" />
          Aperçu :
        </span>
        <button
          type="button"
          onClick={() => setMode("direct")}
          className={`rounded-md border px-2.5 py-1 transition flex items-center gap-1.5 ${
            mode === "direct"
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border hover:bg-muted/40"
          }`}
        >
          <LinkIcon className="size-3.5" />
          Lien direct
        </button>
        <button
          type="button"
          onClick={() => setMode("iframe")}
          className={`rounded-md border px-2.5 py-1 transition flex items-center gap-1.5 ${
            mode === "iframe"
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border hover:bg-muted/40"
          }`}
        >
          <SquareIcon className="size-3.5" />
          Iframe
        </button>
      </div>

      {/* Cadre du rendu — simule la page publique dans un container
          contraint. min-h volontairement souple pour ne pas voler
          tout l'écran ; on laisse le contenu dicter la hauteur. */}
      <div
        className="rounded-lg border overflow-hidden"
        style={pageBgStyle}
      >
        <div className="w-full max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
          {showBranding && branding.logoUrl ? (
            <div className="flex items-center justify-center pb-1">
              <Image
                src={branding.logoUrl}
                alt=""
                width={120}
                height={32}
                unoptimized
                className="h-7 w-auto opacity-90 object-contain"
              />
            </div>
          ) : null}

          {heading || subheading ? (
            <div className="text-center space-y-1.5">
              {heading ? (
                <h2 className="text-lg sm:text-xl font-bold text-white drop-shadow-sm">
                  {heading}
                </h2>
              ) : null}
              {subheading ? (
                <p className="text-xs sm:text-sm text-white/80 max-w-2xl mx-auto">
                  {subheading}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={wrapperClassName} style={wrapperStyle}>
            <PopquizPlayer
              popquiz={popquiz}
              renderOverlay={() => null}
            />
          </div>

          {showBranding && branding.websiteUrl ? (
            <p className="text-center text-[10px] text-white/60">
              {prettyHost(branding.websiteUrl)}
            </p>
          ) : null}

          <p
            className={`text-center text-[10px] ${
              mode === "direct"
                ? "text-white/40"
                : "text-foreground/40"
            }`}
          >
            Cette vidéo vous est proposée via Tiquiz
          </p>
        </div>
      </div>

      {/* Lien réel pour aller voir le rendu en plein écran */}
      {mode === "direct" ? (
        <p className="text-[11px] text-muted-foreground">
          Le rendu réel sera plein écran sur le navigateur du visiteur.
          {appearance.bgStyle === "transparent" ? (
            <> Fond noir par défaut.</>
          ) : null}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          L&apos;iframe occupe la place que lui donne le site hôte —
          pas de titre / sous-titre / fond, juste la vidéo + signature.
        </p>
      )}
    </div>
  );
}

/** Helper : passe `tiquizDiscoveryUrl` aux composants enfants au cas
 *  où tu veux le réutiliser ailleurs. Pas exporté côté default mais
 *  disponible si besoin. */
export { tiquizDiscoveryUrl };
