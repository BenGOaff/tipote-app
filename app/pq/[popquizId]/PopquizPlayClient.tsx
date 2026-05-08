"use client";

// Client wrapper for the public play page. Wraps the player in the
// creator's branding chrome:
//   • logo above (centred) when set on the profile
//   • website link below as a discreet footer
// Both pieces are optional — a creator with no branding configured
// just sees a clean black-on-black player, no orphan UI.
//
// The overlay slot iframes /q/[cue.quizId] for guaranteed style
// isolation. The X close button is rendered by PopquizPlayer's
// chrome itself — the slot only owns the quiz surface.

import Image from "next/image";
import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import { PopquizQuizIframe } from "@/components/popquiz/PopquizQuizIframe";
import { usePopquizEventTracker } from "@/lib/popquiz/usePopquizEventTracker";
import type { Popquiz } from "@/lib/popquiz";

function prettyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// URL de découverte Tiquiz côté tipote.fr. Si le créateur a posé son
// ID affilié SIO dans Settings, on le propage en query string ?sa=<id>
// pour que les inscriptions qui en découlent lui rapportent une
// commission. Sinon le lien reste fonctionnel (visite directe), juste
// non trackée.
function tiquizDiscoveryUrl(affiliateId: string | null): string {
  const base = "https://www.tipote.fr/part-tiquiz";
  if (!affiliateId) return base;
  return `${base}?sa=${encodeURIComponent(affiliateId)}`;
}

export default function PopquizPlayClient({
  popquiz,
}: {
  popquiz: Popquiz;
}) {
  const { branding } = popquiz;
  const onEvent = usePopquizEventTracker(popquiz.id);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-5xl space-y-3 sm:space-y-4">
        {branding.logoUrl ? (
          <div className="flex items-center justify-center pb-1">
            {/* Decorative logo — sized down so it never competes with
                the video as the visual anchor. */}
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

        <PopquizPlayer
          popquiz={popquiz}
          onEvent={onEvent}
          renderOverlay={({ cue }) => <PopquizQuizIframe quizId={cue.quizId} />}
        />

        <footer className="text-center pt-1 space-y-1">
          {branding.websiteUrl ? (
            <a
              href={branding.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-white/60 hover:text-white/90 transition-colors"
            >
              {prettyHost(branding.websiteUrl)}
            </a>
          ) : null}
          {/* Footer "via Tiquiz" — affiché en permanence pour donner
              de la visibilité au produit. Trackable (commission au
              créateur) seulement si l'ID affilié est posé dans
              Settings → Connexions → Systeme.io. */}
          <a
            href={tiquizDiscoveryUrl(branding.tipoteAffiliateId)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[11px] text-white/40 hover:text-white/70 transition-colors"
          >
            Cette vidéo vous est proposée via Tiquiz
          </a>
        </footer>
      </div>
    </div>
  );
}
