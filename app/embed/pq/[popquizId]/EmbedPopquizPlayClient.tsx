"use client";

// Iframe-friendly variant of the public play client. Uses
// `position: fixed; inset: 0` so the player always fills the iframe
// viewport regardless of the embedding page's CSS. The player itself
// keeps its 16:9 aspect-video, so when the snippet uses the standard
// padding-bottom 56.25% trick, the fit is pixel-perfect.
//
// Footer "via Tiquiz" : ajouté en absolu en bas du conteneur — un
// vrai SaaS embed (Calendly, Typeform, Loom…) garde toujours sa
// signature dans l'iframe pour la portée de marque. Tracking
// d'affiliation appliqué automatiquement si le créateur a posé son
// ID Tipote dans Settings.

import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import { PopquizQuizIframe } from "@/components/popquiz/PopquizQuizIframe";
import { usePopquizEventTracker } from "@/lib/popquiz/usePopquizEventTracker";
import type { Popquiz } from "@/lib/popquiz";

function tiquizDiscoveryUrl(affiliateId: string | null | undefined): string {
  const base = "https://www.tipote.fr/part-tiquiz";
  if (!affiliateId) return base;
  return `${base}?sa=${encodeURIComponent(affiliateId)}`;
}

export default function EmbedPopquizPlayClient({
  popquiz,
}: {
  popquiz: Popquiz;
}) {
  const onEvent = usePopquizEventTracker(popquiz.id);
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <div className="w-full max-h-full">
        <PopquizPlayer
          popquiz={popquiz}
          onEvent={onEvent}
          renderOverlay={({ cue }) => <PopquizQuizIframe quizId={cue.quizId} />}
        />
      </div>
      {/* Signature Tiquiz — discrète mais persistante. Ne mange pas
          de hauteur sur le player (positionnée par-dessus en bas du
          conteneur fixé). */}
      <a
        href={tiquizDiscoveryUrl(popquiz.branding.tipoteAffiliateId)}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-white/40 hover:text-white/70 transition-colors px-2 py-0.5 rounded bg-black/30 backdrop-blur-sm"
      >
        Cette vidéo vous est proposée via Tiquiz
      </a>
    </div>
  );
}
