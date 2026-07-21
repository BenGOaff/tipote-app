"use client";

// Variante iframe-friendly de la page publique. Pas de wrapper
// `fixed inset-0 bg-black` qui produisait une bordure noire moche
// quand l'iframe n'était pas exactement en 16:9 — ici on laisse
// l'iframe transparente et la vidéo occupe naturellement la place
// que lui donne le code embed du créateur.
//
// L'apparence (bordure / ombre / bouton play / couleur du bouton)
// est partagée avec la page publique via le helper appearance.ts —
// rendu identique côté embed et côté lien direct.
//
// Footer "via Tiquiz" toujours présent (signature business). Pas
// de titre/sous-titre/branding créateur dans l'embed pour rester
// minimal et ne pas dupliquer ce que la page hôte affiche déjà.

import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import { PopquizQuizIframe } from "@/components/popquiz/PopquizQuizIframe";
import { usePopquizEventTracker } from "@/lib/popquiz/usePopquizEventTracker";
import {
  buildPlayerWrapperClassName,
  buildPlayerWrapperStyle,
  tiquizDiscoveryUrl,
} from "@/lib/popquiz/appearance";
import type { Popquiz } from "@/lib/popquiz";
import { useTranslations } from "next-intl";

export default function EmbedPopquizPlayClient({
  popquiz,
}: {
  popquiz: Popquiz;
}) {
  const t = useTranslations("popquiz");
  const { branding, appearance } = popquiz;
  const onEvent = usePopquizEventTracker(popquiz.id);

  const wrapperClassName = buildPlayerWrapperClassName(appearance);
  const wrapperStyle = buildPlayerWrapperStyle(appearance);

  return (
    <div className="public-surface w-full min-h-screen flex flex-col items-center justify-center bg-transparent">
      <div className="w-full max-w-5xl mx-auto">
        <div className={wrapperClassName} style={wrapperStyle}>
          <PopquizPlayer
            popquiz={popquiz}
            onEvent={onEvent}
            renderOverlay={({ cue }) => <PopquizQuizIframe quizId={cue.quizId} />}
          />
        </div>

        {/* Footer "via Tiquiz" — discret, mais toujours présent dans
            l'embed pour la portée business chez les hôtes externes. */}
        <a
          href={tiquizDiscoveryUrl(branding.tipoteAffiliateId)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center mt-2 text-[11px] text-foreground/40 hover:text-foreground/70 transition-colors"
        >
          {t("poweredByVideo")}
        </a>
      </div>
    </div>
  );
}
