// components/ui/ai-generating-overlay.tsx
// Fullscreen overlay shown while AI is generating something (a quiz, a
// survey, a piece of content from CreateHub). Covers the entire
// viewport with a blurred backdrop so the user can't double-submit and
// the page underneath stays mounted (state, scroll, etc. preserved).
//
// What this component delivers compared to a stock spinner:
//   - The mascot in "thinking" expression — gives the wait an
//     identity, not just a generic loader
//   - A rotating fun message every ~2.4 s so a 15 s generation feels
//     attentive instead of frozen
//   - A halo pulse + bouncing dots layered behind the mascot for
//     subtle motion without distracting from the copy
//
// Used by:
//   - QuizFormClient / SurveyFormClient — wraps the AI tab content
//   - CreateHub — wraps the whole page during content generation

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Mascot } from "@/components/ui/mascot";

interface AIGeneratingOverlayProps {
  /** Optional override for the main message */
  message?: string;
  /** Optional override for the sub-message */
  submessage?: string;
  /** Optional rotating sub-messages — cycles through them every ~2.4 s
   *  while the overlay is up. Falls back to `submessage` if absent. */
  rotatingMessages?: string[];
}

export function AIGeneratingOverlay({ message, submessage, rotatingMessages }: AIGeneratingOverlayProps) {
  const t = useTranslations("common");
  const [tickIndex, setTickIndex] = useState(0);

  // Cycle through the rotating messages at a comfortable cadence.
  // Pause when only one message is provided.
  useEffect(() => {
    if (!rotatingMessages || rotatingMessages.length < 2) return;
    const id = window.setInterval(() => {
      setTickIndex((i) => (i + 1) % rotatingMessages.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [rotatingMessages]);

  const subline = rotatingMessages && rotatingMessages.length > 0
    ? rotatingMessages[tickIndex]
    : submessage ?? t("aiGeneratingSubtitle");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={message ?? t("aiGeneratingTitle")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
    >
      <div className="flex flex-col items-center max-w-md text-center">
        {/* Mascot anchored on a soft halo — the halo pulses, the
            mascot stays still so the whole thing reads "warmly busy"
            rather than "machine spinning". */}
        <div className="relative mb-6">
          <div className="absolute inset-0 -m-4 rounded-full bg-primary/15 blur-xl animate-pulse" />
          <div className="relative w-24 h-24 rounded-full bg-card border border-border/60 shadow-card flex items-center justify-center">
            <Mascot expression="thinking" size={64} tone="soft" />
          </div>
        </div>

        {/* Bouncing dots — preserved from the previous incarnation,
            they reinforce "actively working" without being noisy. */}
        <div className="flex gap-1.5 mb-6">
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
        </div>

        <h3 className="text-lg font-semibold mb-2">
          {message ?? t("aiGeneratingTitle")}
        </h3>

        {/* Crossfade between rotating sublines so they don't pop in.
            Keyed on tickIndex so each new line gets a fresh animation. */}
        <p
          key={tickIndex}
          className="text-sm text-muted-foreground leading-relaxed animate-quiz-step-in"
        >
          {subline}
        </p>
      </div>
    </div>
  );
}
