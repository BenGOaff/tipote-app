// components/tutorial/TutorialSpotlight.tsx
"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTutorial } from "@/hooks/useTutorial";


type TooltipPosition = "top" | "bottom" | "left" | "right";

const TOOLTIP_MAX_W = 280;
const TOOLTIP_ESTIMATED_H = 160;
const VIEWPORT_MARGIN = 8;

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

  const {
    shouldHighlight,
    currentTooltip,
    nextPhase,
    nextPhaseUrl,
    phase,
    currentStep,
    totalSteps,
    skipTutorial,
  } = useTutorial();
  const t = useTranslations("tutorial");
  const router = useRouter();

  const isActive = shouldHighlight(elementId);
  const shouldShow = isActive && Boolean(currentTooltip);

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; transform: string } | null>(null);

  const lastViewedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!shouldShow) return;

    const key = `${phase}__${elementId}`;
    if (lastViewedKeyRef.current === key) return;
    lastViewedKeyRef.current = key;
  }, [shouldShow, phase, elementId]);

  const computePosition = useMemo(() => {
    return () => {
      const el = anchorRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const gap = 12;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const isMobile = vw < 768;

      let top: number;
      let left: number;
      let transform: string;

      let preferredPosition = tooltipPosition;

      if (isMobile) {
        preferredPosition = rect.bottom + TOOLTIP_ESTIMATED_H + gap < vh ? "bottom" : "top";
      }

      if (preferredPosition === "right") {
        if (rect.right + gap + TOOLTIP_MAX_W > vw - VIEWPORT_MARGIN) {
          preferredPosition = "left";
        }
      }

      if (preferredPosition === "left") {
        if (rect.left - gap - TOOLTIP_MAX_W < VIEWPORT_MARGIN) {
          preferredPosition = "bottom";
        }
      }

      switch (preferredPosition) {
        case "right":
          top = rect.top + rect.height / 2;
          left = rect.right + gap;
          transform = "translateY(-50%)";
          break;
        case "left":
          top = rect.top + rect.height / 2;
          left = rect.left - gap;
          transform = "translate(-100%, -50%)";
          break;
        case "top":
          top = rect.top - gap;
          left = rect.left + rect.width / 2;
          transform = "translate(-50%, -100%)";
          break;
        default: // bottom
          top = rect.bottom + gap;
          left = rect.left + rect.width / 2;
          transform = "translateX(-50%)";
          break;
      }

      // Clamp left to viewport
      const resolvedLeft = left;
      let clampedLeft = resolvedLeft;

      if (transform.includes("translate(-50%") || transform.includes("translateX(-50%)")) {
        const halfW = TOOLTIP_MAX_W / 2;
        clampedLeft = Math.max(VIEWPORT_MARGIN + halfW, Math.min(vw - VIEWPORT_MARGIN - halfW, left));
      } else if (transform.includes("translate(-100%")) {
        const minLeft = VIEWPORT_MARGIN + TOOLTIP_MAX_W;
        clampedLeft = Math.max(minLeft, left);
      } else {
        const maxLeft = vw - TOOLTIP_MAX_W - VIEWPORT_MARGIN;
        clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(maxLeft, left));
      }

      // Clamp top to viewport
      let clampedTop = top;

      if (transform.includes("translateY(-50%)") || transform.includes("translate(-50%, -50%)")) {
        const halfH = TOOLTIP_ESTIMATED_H / 2;
        clampedTop = Math.max(VIEWPORT_MARGIN + halfH, Math.min(vh - VIEWPORT_MARGIN - halfH, top));
      } else if (transform.includes("translate(-50%, -100%)") || transform === "translate(-100%, -50%)") {
        if (transform === "translate(-50%, -100%)") {
          const minTop = TOOLTIP_ESTIMATED_H + VIEWPORT_MARGIN;
          clampedTop = Math.max(minTop, top);
        } else {
          const halfH = TOOLTIP_ESTIMATED_H / 2;
          clampedTop = Math.max(VIEWPORT_MARGIN + halfH, Math.min(vh - VIEWPORT_MARGIN - halfH, top));
        }
      } else {
        const maxTop = vh - TOOLTIP_ESTIMATED_H - VIEWPORT_MARGIN;
        clampedTop = Math.max(VIEWPORT_MARGIN, Math.min(maxTop, top));
      }

      setPos({ top: clampedTop, left: clampedLeft, transform });
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
    nextPhase();
    if (nextPhaseUrl) router.push(nextPhaseUrl);
  };

  const handleSkip = () => {
    skipTutorial();
  };

  return (
    <div ref={anchorRef} className={cn("relative", className)}>
      {/* Spotlight ring */}
      {shouldShow ? (
        <div
          className="absolute -inset-1 rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background pointer-events-none z-30"
          aria-hidden="true"
        />
      ) : null}

      {children}

      {/* Tooltip in Portal */}
      {mounted && shouldShow && pos
        ? createPortal(
            <div
              className="fixed z-[9999] pointer-events-auto"
              style={{
                top: pos.top,
                left: pos.left,
                transform: pos.transform,
                maxWidth: TOOLTIP_MAX_W,
                width: `min(${TOOLTIP_MAX_W}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
              }}
            >
              <div className="bg-card border border-border rounded-xl shadow-xl p-4 relative">
                {/* Step counter + close */}
                <div className="flex items-center justify-between mb-2">
                  {currentStep > 0 ? (
                    <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {currentStep} / {totalSteps}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={handleSkip}
                    className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
                    aria-label={t("skipTour")}
                    title={t("skipTour")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Tooltip text */}
                <p className="text-sm text-foreground leading-relaxed">{currentTooltip}</p>

                {/* Next button */}
                {showNextButton ? (
                  <Button
                    variant="default"
                    size="sm"
                    className="mt-3 w-full gap-1"
                    onClick={handleNext}
                  >
                    {t("next")}
                    <ChevronRight className="w-3.5 h-3.5" />
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
