// components/ui/readiness-ring.tsx
// Compact "x/y ready" ring + label. Drops next to a project name on
// list rows or in the editor's top bar to nudge the creator toward
// finishing what's left.
//
//   <ReadinessRing percent={75} passed={3} total={4} />
//
// The ring is a simple SVG circle with a stroke-dashoffset trick so we
// don't pull a chart lib for what amounts to one arc.

import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  percent: number;
  passed: number;
  total: number;
  /** Smaller variant used in dense list rows. */
  size?: "sm" | "md";
  /** Tone swap: "ready" = green when 100%, otherwise primary blue. */
  className?: string;
};

export function ReadinessRing({ percent, passed, total, size = "md", className }: Props) {
  const dim = size === "sm" ? 32 : 44;
  const stroke = size === "sm" ? 3 : 4;
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;

  const isReady = passed === total && total > 0;
  // Soft green when fully ready, muted-then-primary as the user fills it in.
  const ringColor = isReady ? "stroke-emerald-500" : percent === 0 ? "stroke-muted-foreground/30" : "stroke-primary";
  const labelColor = isReady ? "text-emerald-600" : "text-foreground";

  return (
    <div className={cn("inline-flex items-center gap-2", className)} aria-label={`${passed} sur ${total} étapes`}>
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="shrink-0">
        {/* Track */}
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        {/* Progress arc */}
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={cn("transition-[stroke-dashoffset] duration-500", ringColor)}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          // Start the arc at the top (12 o'clock).
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
        />
      </svg>
      <div className={cn("text-xs leading-tight tabular-nums", labelColor)}>
        <span className="font-semibold">{passed}</span>
        <span className="text-muted-foreground">/{total}</span>
      </div>
    </div>
  );
}
