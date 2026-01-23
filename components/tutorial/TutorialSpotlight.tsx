// components/tutorial/TutorialSpotlight.tsx
"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTutorial } from "@/hooks/useTutorial";
import { ampTrack } from "@/lib/telemetry/amplitude-client";

type TooltipPosition = "top" | "bottom" | "left" | "right";

export function TutorialSpotlight(props: {
  elementId: string;
  children: ReactNode;
  className?: string;
  tooltipPosition?: TooltipPosition;
  showNextButton?: boolean;
}) {
  const {
    elementId,
    children,
    className,
    tooltipPosition = "right",
    showNextButton,
  } = props;

  const { shouldHighlight, currentTooltip, nextPhase, phase } = useTutorial();

  const isActive = shouldHighlight(elementId);
  const shouldShow = isActive && Boolean(currentTooltip);

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; transform: string } | null>(
    null,
  );

  // Anti-spam : on n'envoie l'event "viewed" qu'une seule fois par (phase + elementId)
  const lastViewedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ✅ Track : affichage d'une étape du tutoriel (spotlight visible)
  useEffect(() => {
    if (!shouldShow) return;

    const key = `${phase}__${elementId}`;
    if (lastViewedKeyRef.current === key) return;
    lastViewedKeyRef.current = key;

    ampTrack("tipote_tutorial_step_viewed", {
      tutorial_phase: phase,
      spotlight_element: elementId,
    });
  }, [shouldShow, phase, elementId]);

  const computePosition = useMemo(() => {
    return () => {
      const el = anchorRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();

      // Tooltip en fixed (viewport), donc pas d’offset scroll à ajouter.
      const gap = 16;

      if (tooltipPosition === "right") {
        setPos({
          top: rect.top + rect.height / 2,
          left: rect.right + gap,
          transform: "translateY(-50%)",
        });
        return;
      }

      if (tooltipPosition === "left") {
        setPos({
          top: rect.top + rect.height / 2,
          left: rect.left - gap,
          transform: "translate(-100%, -50%)",
        });
        return;
      }

      if (tooltipPosition === "top") {
        setPos({
          top: rect.top - gap,
          left: rect.left + rect.width / 2,
          transform: "translate(-50%, -100%)",
        });
        return;
      }

      // bottom
      setPos({
        top: rect.bottom + gap,
        left: rect.left + rect.width / 2,
        transform: "translateX(-50%)",
      });
    };
  }, [tooltipPosition]);

  useEffect(() => {
    if (!shouldShow) return;

    computePosition();

    const onScroll = () => computePosition();
    const onResize = () => computePosition();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [shouldShow, computePosition]);

  const handleNext = () => {
    ampTrack("tipote_tutorial_next_clicked", {
      tutorial_phase: phase,
      spotlight_element: elementId,
    });

    nextPhase();
  };

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      {/* Spotlight border (reste dans la sidebar) */}
      {shouldShow ? (
        <div
          className="absolute -inset-1 rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background pointer-events-none z-30"
          aria-hidden="true"
        />
      ) : null}

      {/* L’item de menu */}
      {children}

      {/* Tooltip en Portal (hors sidebar) => plus jamais clippé */}
      {mounted && shouldShow && pos
        ? createPortal(
            <div
              className="fixed z-[9999] pointer-events-auto"
              style={{
                top: pos.top,
                left: pos.left,
                transform: pos.transform,
              }}
            >
              <div className="bg-card border border-border rounded-lg shadow-lg p-4 relative max-w-[280px]">
                <p className="text-sm text-foreground leading-relaxed">{currentTooltip}</p>

                {showNextButton ? (
                  <Button variant="secondary" className="mt-2 w-full" onClick={handleNext}>
                    Suivant
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
