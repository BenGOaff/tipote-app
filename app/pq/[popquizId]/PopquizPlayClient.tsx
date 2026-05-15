"use client";

// Page publique d'un popquiz — `/pq/[id]`. C'est là qu'atterrit
// quelqu'un qui clique sur le lien partagé par le créateur. La
// page DOIT être :
//   • plein écran, responsive, jolie même sans config
//   • personnalisable : titre, sous-titre, fond (couleur ou gradient),
//     bordure, ombre, bouton play, branding créateur on/off
//   • cohérente avec ce que l'embed iframe produit (même rendu,
//     juste sans le wrapper page)
//
// Le footer "Cette vidéo vous est proposée via Tiquiz" reste TOUJOURS
// visible, c'est notre signature business — son tracking est opt-in
// via `branding.tipoteAffiliateId`.

import Image from "next/image";
import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import { PopquizQuizIframe } from "@/components/popquiz/PopquizQuizIframe";
import { usePopquizEventTracker } from "@/lib/popquiz/usePopquizEventTracker";
import {
  buildPlayerWrapperClassName,
  buildPlayerWrapperStyle,
  buildPageBackgroundStyle,
  tiquizDiscoveryUrl,
} from "@/lib/popquiz/appearance";
import { sanitizeRichText } from "@/lib/richText";
import type { Popquiz } from "@/lib/popquiz";

function prettyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function PopquizPlayClient({
  popquiz,
}: {
  popquiz: Popquiz;
}) {
  const { branding, appearance } = popquiz;
  const onEvent = usePopquizEventTracker(popquiz.id);

  // Titre / sous-titre : on préfère ce que l'user a posé dans
  // appearance.displayTitle ; fallback sur popquiz.title (= titre
  // interne) UNIQUEMENT si l'user a explicitement demandé un titre
  // affiché. Sinon, on n'affiche rien (rendu épuré, focus sur la vidéo).
  const heading = appearance.displayTitle?.trim() || null;
  const subheading = appearance.displaySubtitle?.trim() || null;

  // Fond de la page (transparent / solid / gradient)
  const pageBgStyle = buildPageBackgroundStyle(appearance);

  // Wrapper du player — bordure + ombre + radius
  const wrapperClassName = buildPlayerWrapperClassName(appearance);
  const wrapperStyle = buildPlayerWrapperStyle(appearance);

  return (
    <div
      className="public-surface min-h-screen w-full flex flex-col items-center justify-center p-3 sm:p-6 md:p-10"
      style={pageBgStyle}
    >
      <div className="w-full max-w-5xl space-y-3 sm:space-y-4 mx-auto">
        {/* Logo créateur (si activé) */}
        {appearance.showCreatorBranding && branding.logoUrl ? (
          <div className="flex items-center justify-center pb-1">
            <Image
              src={branding.logoUrl}
              alt=""
              width={120}
              height={32}
              unoptimized
              className="h-7 sm:h-8 w-auto opacity-90 object-contain"
            />
          </div>
        ) : null}

        {/* Titre + sous-titre (si configurés). Le créateur peut taper
            du HTML rich-text (gras / italique / couleur / alignement)
            via l'éditeur côté admin — on rend le HTML après
            sanitisation pour rester XSS-safe. Les classes
            `tipote-quiz-rich` + `tipote-quiz-rich-inline` s'occupent
            des styles d'alignement ET neutralisent les block-levels
            parasites (<p>, <div>, <h3>…) qui faisaient sauter la
            taille de police au milieu d'une même ligne — bug typo
            identifié sur la page capture en mai 2026, dont le popquiz
            héritait du même pattern. */}
        {heading || subheading ? (
          <div className="text-center space-y-1.5">
            {heading ? (
              <h1
                className="tipote-quiz-rich tipote-quiz-rich-inline text-xl sm:text-2xl md:text-3xl font-bold text-white drop-shadow-sm leading-tight"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(heading) }}
              />
            ) : null}
            {subheading ? (
              <p
                className="tipote-quiz-rich tipote-quiz-rich-inline text-sm sm:text-base text-white/80 max-w-2xl mx-auto leading-snug"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(subheading) }}
              />
            ) : null}
          </div>
        ) : null}

        {/* Player avec bordure + ombre custom */}
        <div className={wrapperClassName} style={wrapperStyle}>
          <PopquizPlayer
            popquiz={popquiz}
            onEvent={onEvent}
            renderOverlay={({ cue }) => <PopquizQuizIframe quizId={cue.quizId} />}
          />
        </div>

        {/* Lien site créateur (si activé) */}
        {appearance.showCreatorBranding && branding.websiteUrl ? (
          <footer className="text-center pt-1">
            <a
              href={branding.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-white/60 hover:text-white/90 transition-colors"
            >
              {prettyHost(branding.websiteUrl)}
            </a>
          </footer>
        ) : null}

        {/* Footer "via Tiquiz" — toujours visible (signature business) */}
        <a
          href={tiquizDiscoveryUrl(branding.tipoteAffiliateId)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[11px] text-white/40 hover:text-white/70 transition-colors"
        >
          Cette vidéo vous est proposée via Tiquiz
        </a>
      </div>
    </div>
  );
}
