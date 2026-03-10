// components/ui/ai-generating-overlay.tsx
// Reusable overlay shown while Tipote AI is generating content.
// Displays a fun animated loader with a multilingual message.

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
    <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 py-12">
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
