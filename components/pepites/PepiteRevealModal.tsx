"use client";

// components/pepites/PepiteRevealModal.tsx
// Mobile-game style "card pull" reveal that fires when a brand-new
// pépite is delivered to the user.
//
// Three phases drive the choreography:
//   1. "intro"   → the card back rises from below with overshoot and
//                  starts idling (gentle float + glow + sparkle halo).
//   2. "flipping"→ user (or the auto-tap timer) flips the card; CSS
//                  rotateY runs over 700 ms with backface hidden, plus
//                  a confetti burst at flip start.
//   3. "front"   → contents are readable; the user can dismiss with the
//                  CTA button or by tapping the backdrop.
//
// We keep this dependency-free so the bundle stays light: confetti from
// the existing celebrate() helper, particles via Tailwind keyframes
// driven by inline CSS variables for each spark's flight vector.

import * as React from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { celebrate } from "@/lib/celebrate";
import { useTranslations } from "next-intl";

type Pepite = {
  userPepiteId: string;
  pepite: { id: string; title: string; body: string } | null;
};

type Phase = "intro" | "flipping" | "front";

const SPARK_COUNT = 14;

/**
 * Pre-computed spark vectors so the burst is deterministic per render
 * (no layout thrash from re-randomising on every paint). 14 sparks fan
 * outward in a near-uniform circle with slight jitter for organic feel.
 */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * Math.PI * 2;
  const radius = 90 + (i % 3) * 18; // 90 / 108 / 126 px
  return {
    sx: Math.cos(angle) * radius,
    sy: Math.sin(angle) * radius,
    delayMs: (i * 60) % 480,
    hue: i % 3 === 0 ? "primary" : i % 3 === 1 ? "amber" : "emerald",
  };
});

function enhanceForDisplay(text: string) {
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    const trimmed = line.trimStart();
    const isArrow = trimmed.startsWith("👉");
    return (
      <p key={idx} className={isArrow ? "font-semibold" : ""}>
        {line || <span className="block h-3" />}
      </p>
    );
  });
}

export function PepiteRevealModal({
  item,
  onClose,
}: {
  item: Pepite;
  onClose: () => void;
}) {
  const t = useTranslations("pepites");
  const [phase, setPhase] = React.useState<Phase>("intro");
  const title = item.pepite?.title ?? t("cardDefault");
  const body = item.pepite?.body ?? "";

  // Fire confetti on flip start — the satisfying "you got it!" payoff.
  const handleFlip = React.useCallback(() => {
    if (phase !== "intro") return;
    setPhase("flipping");
    celebrate({ intensity: "huge" });
    // Match the CSS rotation duration, then unlock the close CTA.
    window.setTimeout(() => setPhase("front"), 720);
  }, [phase]);

  // Lock body scroll while the modal is up.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC closes; Enter / Space flips when intro.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if ((e.key === "Enter" || e.key === " ") && phase === "intro") {
        e.preventDefault();
        handleFlip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase, handleFlip]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 sm:px-6 bg-background/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        // Only close via backdrop once the front is showing — otherwise
        // the user could miss the reveal by mis-tapping during the
        // entrance animation.
        if (phase === "front" && e.target === e.currentTarget) onClose();
      }}
    >
      {/* Tagline above the card. Pushed lower on the smallest phones
          (top-[10%]) so the X close button at top-4 doesn't sit on
          top of the headline; eased back up as the viewport gets
          taller so the proportions feel right on a tablet/desktop. */}
      <div className="absolute top-[10%] sm:top-[15%] left-0 right-0 px-6 text-center pointer-events-none">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">
          {t("revealKicker")}
        </p>
        <h2 className="mt-2 text-xl sm:text-3xl font-bold text-foreground line-clamp-2">
          {phase === "front" ? title : t("revealHeadline")}
        </h2>
      </div>

      {/* Close button — top right; available immediately */}
      <button
        type="button"
        aria-label={t("revealClose")}
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-card/80 backdrop-blur border border-border/60 flex items-center justify-center text-foreground hover:bg-card transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Sparkle particle burst — radiates outward from the card centre.
          Particles share one absolutely-positioned origin so the
          variables (--sx/--sy) flight vectors stay relative to it. */}
      <div className="relative pointer-events-none" aria-hidden>
        <SparkleBurst phase={phase} />
      </div>

      {/* Card stage — the 3D-perspective container. Inner card flips
          on rotateY thanks to transform-style: preserve-3d. */}
      <div
        className="relative pointer-events-auto"
        style={{ perspective: "1200px" }}
      >
        {/* Halo behind the card (idles when intro) */}
        {phase === "intro" && (
          <div
            aria-hidden
            className="absolute inset-0 -m-6 rounded-[28px] bg-gradient-to-br from-primary/30 via-fuchsia-400/20 to-amber-300/30 blur-xl animate-pepite-halo"
          />
        )}

        <button
          type="button"
          onClick={() => {
            if (phase === "intro") handleFlip();
            else if (phase === "front") onClose();
          }}
          aria-label={phase === "intro" ? t("revealTap") : t("revealClose")}
          className="relative block w-[280px] h-[400px] sm:w-[320px] sm:h-[460px] focus:outline-none animate-pepite-pop"
          style={{
            transformStyle: "preserve-3d",
          }}
        >
          {/* Inner flipper — rotates the whole card */}
          <div
            className="absolute inset-0 transition-transform duration-700 ease-out"
            style={{
              transformStyle: "preserve-3d",
              transform:
                phase === "intro"
                  ? "rotateY(0deg)"
                  : "rotateY(180deg)",
            }}
          >
            {/* Card back — what the user sees first.
                Faces the camera at rotateY(0). */}
            <div
              className={
                "absolute inset-0 rounded-[28px] overflow-hidden " +
                "bg-gradient-to-br from-primary via-indigo-600 to-fuchsia-600 " +
                "shadow-[0_30px_80px_-20px_rgba(93,108,219,0.6)] " +
                (phase === "intro"
                  ? "animate-pepite-float animate-pepite-glow"
                  : "")
              }
              style={{
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              {/* Subtle diagonal sheen */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-30 mix-blend-overlay"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,0.3) 100%)",
                }}
              />
              {/* Sparkle pattern */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 25% 30%, rgba(255,255,255,0.4) 0%, transparent 8%), radial-gradient(circle at 75% 60%, rgba(255,255,255,0.35) 0%, transparent 6%), radial-gradient(circle at 50% 80%, rgba(255,255,255,0.3) 0%, transparent 5%)",
                }}
              />
              {/* Centred badge */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6">
                <div className="w-20 h-20 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-4 ring-1 ring-white/30">
                  <Sparkles className="w-10 h-10" />
                </div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/80">
                  Pépite
                </p>
                <p className="mt-1 text-lg font-bold">Tipote</p>
                <div className="mt-6 px-4 py-2 rounded-full bg-white/15 backdrop-blur text-xs font-semibold">
                  {t("revealTap")}
                </div>
              </div>
            </div>

            {/* Card front — content side. Pre-rotated 180° so it sits
                behind the back; the flipper rotates the whole pair into
                view. */}
            <div
              className="absolute inset-0 rounded-[28px] overflow-hidden bg-card border border-border/60 shadow-[0_30px_80px_-20px_rgba(93,108,219,0.4)]"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            >
              <div className="h-full w-full flex flex-col">
                <div className="px-6 pt-6 pb-3 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-[11px] uppercase tracking-[0.2em] font-semibold">
                      {t("revealKicker")}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-foreground leading-snug">
                    {title}
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto px-6 pb-6 text-sm leading-relaxed text-foreground space-y-2">
                  {enhanceForDisplay(body)}
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* CTA — appears only once the front is fully visible */}
      {phase === "front" && (
        <div className="absolute bottom-[10%] left-0 right-0 flex justify-center px-6">
          <Button
            size="lg"
            onClick={onClose}
            className="rounded-full shadow-card-hover"
          >
            {t("revealCta")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkle burst — particles fly out radially using the
// `pepite-spark` keyframe driven by per-particle CSS variables.
// ---------------------------------------------------------------------------

function SparkleBurst({ phase }: { phase: Phase }) {
  // Show particles only during the entrance + flip — once the front is
  // up the user is reading, no need for distraction.
  if (phase === "front") return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className={
            "absolute w-2 h-2 rounded-full animate-pepite-spark " +
            (s.hue === "primary"
              ? "bg-primary"
              : s.hue === "amber"
              ? "bg-amber-400"
              : "bg-emerald-400")
          }
          style={
            {
              "--sx": `${s.sx}px`,
              "--sy": `${s.sy}px`,
              animationDelay: `${s.delayMs}ms`,
              boxShadow: "0 0 8px currentColor",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
