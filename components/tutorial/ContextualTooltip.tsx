// components/tutorial/ContextualTooltip.tsx
"use client";

import { ReactNode, useEffect, useState } from "react";
import { useTutorial, ContextualTooltip as ContextualTooltipType } from "@/hooks/useTutorial";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ContextualTooltipProps {
  contextKey: ContextualTooltipType;
  message: string;
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
  delay?: number;
}

export function ContextualTooltip({
  contextKey,
  message,
  children,
  position = "top",
  className,
  delay = 1000,
}: ContextualTooltipProps) {
  const { hasSeenContext, markContextSeen, tutorialOptOut } = useTutorial();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (tutorialOptOut) return;
    if (hasSeenContext(contextKey)) return;

    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [contextKey, delay, hasSeenContext, tutorialOptOut]);

  const handleDismiss = () => {
    markContextSeen(contextKey);
    setShow(false);
  };

  const positionClasses = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
  };

  return (
    <div className={cn("relative", className)}>
      {children}

      {show && (
        <div className={cn("absolute z-50 min-w-[240px] max-w-[320px]", positionClasses[position])}>
          <div className="gradient-primary text-primary-foreground rounded-xl p-4 shadow-lg shadow-primary/20 relative">
            <div className="flex items-start gap-3">
              <p className="text-sm leading-relaxed flex-1">{message}</p>
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
