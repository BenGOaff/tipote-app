// components/ui/ai-generating-overlay.tsx
// Fullscreen overlay shown while Tiquiz AI is generating a quiz / survey.
// Covers the entire viewport with a blurred backdrop so the page below stays
// frozen and the user can't double-submit. The form / draft content stays
// mounted in the DOM (preserves React state, scroll position, etc.) — only
// the overlay sits on top.
//
// Used by:
//   - QuizFormClient.tsx (Tiquiz + Tipote): drops the AI tab content while
//     generation runs.
//   - SurveyFormClient.tsx (Tiquiz + Tipote): renders alongside the tabs and
//     sits over them.

"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

interface AIGeneratingOverlayProps {
  /** Optional override for the main message */
  message?: string;
  /** Optional override for the sub-message */
  submessage?: string;
}

export function AIGeneratingOverlay({ message, submessage }: AIGeneratingOverlayProps) {
  const t = useTranslations("common");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={message ?? t("aiGeneratingTitle")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
    >
      <div className="flex flex-col items-center max-w-md text-center">
        {/* Animated icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-9 h-9 text-primary animate-pulse" />
          </div>
          {/* Rotating ring */}
          <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-transparent border-t-primary/40 animate-spin" />
        </div>

        {/* Bouncing dots */}
        <div className="flex gap-1.5 mb-6">
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
        </div>

        {/* Main message */}
        <h3 className="text-lg font-semibold mb-2">
          {message ?? t("aiGeneratingTitle")}
        </h3>

        {/* Sub-message */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {submessage ?? t("aiGeneratingSubtitle")}
        </p>
      </div>
    </div>
  );
}
