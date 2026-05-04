"use client";

// Iframe-friendly variant of the public play client. Uses
// `position: fixed; inset: 0` so the player always fills the iframe
// viewport regardless of the embedding page's CSS. The player itself
// keeps its 16:9 aspect-video, so when the snippet uses the standard
// padding-bottom 56.25% trick, the fit is pixel-perfect.

import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import { PopquizQuizIframe } from "@/components/popquiz/PopquizQuizIframe";
import { usePopquizEventTracker } from "@/lib/popquiz/usePopquizEventTracker";
import type { Popquiz } from "@/lib/popquiz";

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
    </div>
  );
}
