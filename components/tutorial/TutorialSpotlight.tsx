// components/tutorial/TutorialSpotlight.tsx
"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTutorial } from "@/hooks/useTutorial";

export function TutorialSpotlight(props: {
  elementId: string;
  children: ReactNode;
  className?: string;
  tooltipPosition?: "top" | "bottom" | "left" | "right";
  showNextButton?: boolean;
}) {
  const {
    elementId,
    children,
    className,
    tooltipPosition = "right",
    showNextButton = false,
  } = props;

  const { shouldHighlight, currentTooltip, nextPhase } = useTutorial();

  const isHighlighted = shouldHighlight(elementId);

  const positionClasses = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
  } as const;

  return (
    <div className={cn("relative", className)}>
      {isHighlighted ? (
        <div className="absolute inset-0 rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse pointer-events-none z-40" />
      ) : null}

      {children}

      {isHighlighted && currentTooltip ? (
        <div
          className={cn(
            "absolute z-50 min-w-[220px] max-w-[300px]",
            positionClasses[tooltipPosition],
          )}
        >
          <div className="bg-card border border-border rounded-lg shadow-lg p-4 relative">
            <p className="text-sm text-foreground leading-relaxed">{currentTooltip}</p>

            {showNextButton ? (
              <Button variant="secondary" className="mt-2 w-full" onClick={nextPhase}>
                Suivant
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
